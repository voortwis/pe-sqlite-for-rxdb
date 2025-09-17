// pe-sqlite-for-rxdb
// Copyright 2024 Pineapple Electric LLC
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by the
// Free Software Foundation, either version 3 of the License, or (at your
// option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
// for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import type {
  BulkWriteRow,
  EventBulk,
  FilledMangoQuery,
  MangoQuerySelector,
  PreparedQuery,
  RxConflictResultionTask,
  RxConflictResultionTaskSolution,
  RxDocumentData,
  RxJsonSchema,
  RxStorageChangeEvent,
  RxStorageCountResult,
  RxStorageInstance,
  RxStorageQueryResult,
  RxStorageWriteError,
  RxStorageBulkWriteResponse,
  RxStorageInstanceCreationParams,
  StringKeys,
} from "rxdb";
import type { Observable } from "rxjs";
import type { RxStoragePESQLiteCheckpoint } from "./storage-checkpoint";
import type { RxStoragePESQLiteImpl } from "./storage-impl";
import type { RxStoragePESQLiteInstanceCreationOptions } from "./storage-instance-options";
import type { RxStoragePESQLiteOptions } from "./storage-options";
import type { DocumentIdGetter } from "./types";

import { getPrimaryFieldOfPrimaryKey } from "rxdb";
import { now, randomCouchString } from "rxdb/plugins/utils";
import { Subject } from "rxjs";
import { RxStoragePESQLiteInternals } from "./storage-internals";

/**
 * RxStoragePESQLiteInstance provides the interface between an RxDB collection
 * and a storage provider.  This means that several instances of this class
 * exist, sharing the same underlying RxStoragePESQLiteInternals (which maps to
 * an RxStoragePESQLiteImpl).
 */
export class RxStoragePESQLiteInstance<RxDocType>
  implements
    RxStorageInstance<
      RxDocType,
      RxStoragePESQLiteInternals,
      RxStoragePESQLiteInstanceCreationOptions,
      RxStoragePESQLiteCheckpoint<RxDocType>
    >
{
  private changes$: Subject<
    EventBulk<
      RxStorageChangeEvent<RxDocumentData<RxDocType>>,
      RxStoragePESQLiteCheckpoint<RxDocType>
    >
  > = new Subject();
  private conflicts$: Subject<RxConflictResultionTask<RxDocType>> =
    new Subject();
  private initComplete?: Promise<number>;
  private primaryField: StringKeys<RxDocType>;

  public closed?: Promise<void>;

  constructor(
    readonly collectionName: string,
    readonly databaseName: string,
    readonly internals: Readonly<RxStoragePESQLiteInternals>,
    readonly options: Readonly<RxStoragePESQLiteInstanceCreationOptions>,
    readonly schema: Readonly<RxJsonSchema<RxDocumentData<RxDocType>>>,
  ) {
    // The return type of getPrimaryFieldOfPrimaryKey() seems to be off by a
    // bit.  There is no reason for RxDocumentData<RxDocType> to be part of the
    // primary field.  For this reason, we cast it to StringKeys<RxDocType>.
    this.primaryField = getPrimaryFieldOfPrimaryKey(
      schema.primaryKey,
    ) as StringKeys<RxDocType>;

    this.internals.then(
      (impl: RxStoragePESQLiteImpl) => {
        this.initComplete = impl.init(this.databaseName, collectionName);
        this.initComplete.then(
          // _userKey is used when closing the storage instance.
          (_userKey: number) => {}, // eslint-disable-line @typescript-eslint/no-unused-vars
          (reason?: unknown) => {
            console.log(`Failed to initialize SQLite database: ${reason}`);
            throw reason;
          },
        );
      },
      (reason?: Error) => {
        console.log(`Failed to get SQLite internals: ${reason}`);
        throw reason;
      },
    );

    this.changes$ = new Subject();
  }

  async bulkWrite(
    documentWrites: BulkWriteRow<RxDocType>[],
    context: string,
  ): Promise<RxStorageBulkWriteResponse<RxDocType>> {
    // startTime is used for change events.
    const startTime = now();
    let error: RxStorageWriteError<RxDocType>[];
    let success: Map<
      RxDocType[StringKeys<RxDocType>],
      RxDocumentData<RxDocType>
    >;
    const getDocumentId: DocumentIdGetter<RxDocType> = (document: RxDocType) =>
      document[this.primaryField];

    const internals = await this.internals;

    if (context === "rx-database-add-collection") {
      ({ success, error } = await internals.addCollections<RxDocType>(
        this.collectionName,
        getDocumentId,
        documentWrites,
      ));
    } else if (
      context === "incremental-write" ||
      context === "internal-add-storage-token" ||
      context === "rx-collection-bulk-insert" ||
      context === "rx-database-remove-collection-all" ||
      context === "rx-document-save-data" ||
      context === "rx-document-remove"
    ) {
      ({ success, error } = await internals.bulkWrite<RxDocType>(
        this.collectionName,
        getDocumentId,
        documentWrites,
      ));
    } else {
      console.log(
        `Unhandled context (${context}) for collection (${this.collectionName})`,
      );
      success = new Map();
      error = [];
    }

    const bulkChangeEvent = {
      id: randomCouchString(10), // There is no documentation on this.
      events: [],
      checkpoint: {
        key: "" as RxDocType[StringKeys<RxDocType>],
        timestamp: 0,
      },
      context: context,
      startTime: startTime,
      endTime: 0,
    } as EventBulk<
      RxStorageChangeEvent<RxDocumentData<RxDocType>>,
      RxStoragePESQLiteCheckpoint<RxDocType>
    >;
    const changeEvents = bulkChangeEvent.events;
    const resultSuccess: Array<RxDocumentData<RxDocType>> = [];
    for (let i = 0; i < documentWrites.length; i++) {
      const write = documentWrites[i];
      const document = write.document;
      const documentId: RxDocType[StringKeys<RxDocType>] =
        getDocumentId(document);
      const documentData: RxDocumentData<RxDocType> | undefined =
        success.get(documentId);
      if (documentData === undefined) {
        continue;
      }
      const documentDeleted: boolean = document._deleted;
      const previousDocumentData = write.previous;
      const previousDeleted = !!previousDocumentData?._deleted;

      let operation: "DELETE" | "INSERT" | "UPDATE";
      if (!documentDeleted && (previousDeleted || !previousDocumentData)) {
        operation = "INSERT";
      } else if (previousDocumentData && !previousDeleted && !documentDeleted) {
        operation = "UPDATE";
      } else if (documentDeleted) {
        operation = "DELETE";
      } else {
        console.dir(documentData);
        console.dir(previousDocumentData);
        throw new Error(
          `Unexpected operation: previousDeleted: ${previousDeleted}, documentDeleted: ${documentDeleted}`,
        );
      }
      resultSuccess.push(documentData);
      const changeEvent = {
        documentId: documentId as string,
        documentData,
        operation,
        previousDocumentData,
      };
      changeEvents.push(changeEvent);
      bulkChangeEvent.checkpoint = {
        key: documentId,
        timestamp: documentData._meta.lwt,
      };
    }
    bulkChangeEvent.endTime = now();
    if (changeEvents.length > 0) {
      this.changes$.next(bulkChangeEvent);
    }

    return Promise.resolve({
      success: resultSuccess,
      error,
    });
  }

  changeStream(): Observable<
    EventBulk<
      RxStorageChangeEvent<RxDocumentData<RxDocType>>,
      RxStoragePESQLiteCheckpoint<RxDocType>
    >
  > {
    return this.changes$.asObservable();
  }

  // Garbage collection of deleted documents
  cleanup(_minimumDeletedTimeInMilliseconds: number): Promise<boolean> {
    console.log(`Unhandled cleanup() for collection (${this.collectionName})`);
    return Promise.resolve(true);
  }

  close(): Promise<void> {
    if (this.closed) {
      return this.closed;
    }
    this.closed = (async () => {
      this.changes$.complete();
      const userKey = await this.initComplete;
      if (typeof userKey === "number") {
        await (await this.internals).close(userKey);
      } else {
        throw new Error("Unable to close PESQLiteImpl: no userKey");
      }
    })();
    return this.closed;
  }

  conflictResultionTasks(): Observable<RxConflictResultionTask<RxDocType>> {
    return this.conflicts$;
  }

  count(
    _preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageCountResult> {
    console.log(`Unhandled count() for collection (${this.collectionName})`);
    return Promise.resolve({
      count: 0,
      mode: "fast",
    });
  }

  async findDocumentsById(
    ids: Array<string>,
    withDeleted: boolean,
  ): Promise<RxDocumentData<RxDocType>[]> {
    // TODO: Replace this query with a dedicated method on RxStoragePESQLiteImpl.
    const internals = await this.internals;
    let querySelector: MangoQuerySelector<RxDocumentData<RxDocType>>;
    const idsSelector: MangoQuerySelector<RxDocumentData<RxDocType>> =
      primaryKeysInArrayQuerySelector(this.primaryField, ids);
    if (withDeleted) {
      querySelector = idsSelector;
    } else {
      querySelector = arrayOperationValuesSelector("$and", [
        idsSelector,
        notDeletedQuerySelector(),
      ]);
    }
    const filledMangoQuery: FilledMangoQuery<RxDocType> = {
      selector: querySelector,
      sort: [],
      skip: 0,
      limit: 0,
    } as FilledMangoQuery<RxDocType>;
    const queryResult = await internals.query(
      this.collectionName,
      this.schema,
      filledMangoQuery,
    );
    return queryResult.documents;
  }

  getAttachmentData(
    _documentId: string,
    _attachmentId: string,
    _digest: string,
  ): Promise<string> {
    console.log(
      `Unhandled getAttachmentData() for collection (${this.collectionName})`,
    );
    return Promise.resolve("");
  }

  async query(
    preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageQueryResult<RxDocType>> {
    const internals = await this.internals;

    return internals.query(
      this.collectionName,
      this.schema,
      preparedQuery.query,
    );
  }

  // Delete the storage instance for this collection.
  // This will not necessarily remove the underlying SQLite3 database.
  async remove(): Promise<void> {
    return (await this.internals).removeCollection(this.collectionName);
  }

  resolveConflictResultionTask(
    _taskSolution: RxConflictResultionTaskSolution<RxDocType>,
  ): Promise<void> {
    throw new Error(
      `Not Implemented: resolveConflictResultionTask() for collection ${this.collectionName}`,
    );
    return Promise.resolve();
  }
}

export async function createRxStoragePESQLiteInstance<RxDocType>(
  params: RxStorageInstanceCreationParams<
    RxDocType,
    RxStoragePESQLiteInstanceCreationOptions
  >,
  options: RxStoragePESQLiteOptions,
): Promise<RxStoragePESQLiteInstance<RxDocType>> {
  const collectionName = params.collectionName;
  const databaseName = params.databaseName;
  const internals = options.sqliteInternals;
  const instanceOptions = params.options;
  const schema = params.schema;

  return Promise.resolve(
    new RxStoragePESQLiteInstance(
      collectionName,
      databaseName,
      internals,
      instanceOptions,
      schema,
    ),
  );
}

function arrayOperationValuesSelector<
  V extends Array<MangoQuerySelector<S>>,
  S,
>(
  operation: "$and" | "$or",
  values: V,
  selector?: MangoQuerySelector<S>,
): MangoQuerySelector<S> {
  if (selector === undefined) {
    selector = {};
  }
  selector[operation] = values;
  return selector;
}

function primaryKeysInArrayQuerySelector<RxDocType>(
  primaryKeyField: StringKeys<RxDocumentData<RxDocType>>,
  primaryKeyArray: Array<string>,
): MangoQuerySelector<RxDocumentData<RxDocType>> {
  const result = {
    [primaryKeyField]: { $in: primaryKeyArray },
  } as MangoQuerySelector<RxDocumentData<RxDocType>>;
  return result;
}

function notDeletedQuerySelector<RxDocType>(): MangoQuerySelector<
  RxDocumentData<RxDocType>
> {
  const result = { _deleted: { $eq: false } } as MangoQuerySelector<
    RxDocumentData<RxDocType>
  >;
  return result;
}
