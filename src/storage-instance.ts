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
import type { RxStoragePESQLiteImpl } from "./storage-impl";
import type { RxStoragePESQLiteInstanceCreationOptions } from "./storage-instance-options";
import type { RxStoragePESQLiteOptions } from "./storage-options";
import type { DocumentIdGetter } from "./types";

import { getPrimaryFieldOfPrimaryKey } from "rxdb";
import { Subject } from "rxjs";
import { RxStoragePESQLiteCheckpoint } from "./storage-checkpoint";
import { RxStoragePESQLiteInternals } from "./storage-internals";

interface NotRxStorageChangedDocumentsSinceResult<RxDocType, CheckpointType> {
  documents: RxDocumentData<RxDocType>[];
  checkpoint: CheckpointType;
}

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
      RxStoragePESQLiteCheckpoint
    >
{
  private changes$: Subject<
    EventBulk<
      RxStorageChangeEvent<RxDocumentData<RxDocType>>,
      RxStoragePESQLiteCheckpoint
    >
  > = new Subject();
  private conflicts$: Subject<RxConflictResultionTask<RxDocType>> =
    new Subject();
  private primaryField: StringKeys<RxDocumentData<RxDocType>>;
  private userKey: number = 0; // Used by the internals instance.

  public closed?: Promise<void>;

  constructor(
    readonly collectionName: string,
    readonly databaseName: string,
    readonly internals: Readonly<RxStoragePESQLiteInternals>,
    readonly options: Readonly<RxStoragePESQLiteInstanceCreationOptions>,
    readonly schema: Readonly<RxJsonSchema<RxDocumentData<RxDocType>>>,
  ) {
    this.primaryField = getPrimaryFieldOfPrimaryKey(schema.primaryKey);

    this.internals.then(
      (impl: RxStoragePESQLiteImpl) => {
        impl.init(this.databaseName, collectionName).then(
          (userKey: number) => {
            this.userKey = userKey;
          },
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
  }

  async bulkWrite(
    documentWrites: BulkWriteRow<RxDocType>[],
    context: string,
  ): Promise<RxStorageBulkWriteResponse<RxDocType>> {
    const error: RxStorageWriteError<RxDocType>[] = [];
    // success will go away in a later version of the interface.
    const success: RxDocType[] = [];
    const getDocumentId: DocumentIdGetter<RxDocType> = (
      document: RxDocumentData<RxDocType>,
    ) => document[this.primaryField];

    const internals = await this.internals;

    if (
      context === "rx-database-add-collection" &&
      documentWrites.length === 1
    ) {
      const addCollectionResult = await internals.addCollection<RxDocType>(
        this.collectionName,
        getDocumentId,
        documentWrites,
      );
      return Promise.resolve(addCollectionResult);
    } else if (
      context === "internal-add-storage-token" ||
      context === "rx-collection-bulk-insert" ||
      context === "rx-database-remove-collection-all" ||
      context === "rx-document-save-data" ||
      context === "rx-document-remove"
    ) {
      const bulkWriteResult = await internals.bulkWrite<RxDocType>(
        this.collectionName,
        getDocumentId,
        documentWrites,
      );
      return Promise.resolve(bulkWriteResult);
    } else {
      console.log(
        `Unhandled context (${context}) for collection (${this.collectionName})`,
      );
    }

    // TODO: Pass changes to this.changes$

    return Promise.resolve({
      success,
      error,
    });
  }

  changeStream(): Observable<
    EventBulk<
      RxStorageChangeEvent<RxDocumentData<RxDocType>>,
      RxStoragePESQLiteCheckpoint
    >
  > {
    console.log(`changeStream(collection=${this.collectionName})`);
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
      await (await this.internals).close(this.userKey);
      this.userKey = 0;
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

  findDocumentsById(
    _ids: string[],
    _withDeleted: boolean,
  ): Promise<RxDocumentData<RxDocType>[]> {
    console.log(
      `Unhandled findDocumentsById() for collection (${this.collectionName})`,
    );
    return Promise.resolve([]);
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

  getChangedDocumentsSince(
    _limit: number,
    _checkpoint: RxStoragePESQLiteCheckpoint,
  ): Promise<
    NotRxStorageChangedDocumentsSinceResult<
      RxDocumentData<RxDocType>,
      RxStoragePESQLiteCheckpoint
    >
  > {
    console.log(
      `Unhandled getChangedDocumentsSince() for collection (${this.collectionName})`,
    );
    return Promise.resolve({
      documents: [],
      checkpoint: new RxStoragePESQLiteCheckpoint("hello", 123.0),
    });
  }

  async query(
    preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageQueryResult<RxDocType>> {
    const internals = await this.internals;

    return internals.query(this.collectionName, this.schema, preparedQuery);
    /*
      .then((result) => {
        console.log("Query:");
        console.dir(preparedQuery.query, { depth: null });
        console.log("Query plan:");
        console.dir(preparedQuery.queryPlan, { depth: null });
        console.log("Query result:");
        console.dir(result, { depth: null });
        return result;
      });
     */
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
  const schema = params.schema;

  return Promise.resolve(
    new RxStoragePESQLiteInstance(
      collectionName,
      databaseName,
      internals,
      options,
      schema,
    ),
  );
}
