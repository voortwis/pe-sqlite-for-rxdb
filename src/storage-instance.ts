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
} from "rxdb";
import type { Observable } from "rxjs";
import type { RxStoragePESQLiteInstanceCreationOptions } from "./storage-instance-options";

import { Subject } from "rxjs";
import { RxStoragePESQLiteCheckpoint } from "./storage-checkpoint";
import { RxStoragePESQLiteInternals } from "./storage-internals";

interface NotRxStorageChangedDocumentsSinceResult<RxDocType, CheckpointType> {
  documents: RxDocumentData<RxDocType>[];
  checkpoint: CheckpointType;
}

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
    EventBulk<RxStorageChangeEvent<RxDocType>, RxStoragePESQLiteCheckpoint>
  > = new Subject();

  public closed?: Promise<void>;

  constructor(
    readonly collectionName: string,
    readonly databaseName: string,
    readonly internals: Readonly<RxStoragePESQLiteInternals>,
    readonly options: Readonly<RxStoragePESQLiteInstanceCreationOptions>,
    readonly schema: Readonly<RxJsonSchema<RxDocumentData<RxDocType>>>,
  ) {}

  bulkWrite(
    documentWrites: BulkWriteRow<RxDocType>[],
    context: string,
  ): Promise<RxStorageBulkWriteResponse<RxDocType>> {
    const errors: RxStorageWriteError<RxDocType>[] = [];
    return Promise.resolve({
      error: errors,
    });
  }

  changeStream(): Observable<
    EventBulk<RxStorageChangeEvent<RxDocType>, RxStoragePESQLiteCheckpoint>
  > {
    return this.changes$.asObservable();
  }

  // Garbage collection of deleted documents
  cleanup(_minimumDeletedTimeInMilliseconds: number): Promise<boolean> {
    return Promise.resolve(true);
  }

  close(): Promise<void> {
    if (this.closed) {
      return this.closed;
    }
    this.closed = (async () => {
      this.changes$.complete();
      await this.internals.close();
    })();
    return this.closed;
  }

  conflictResultionTasks(): Observable<RxConflictResultionTask<RxDocType>> {
    return new Subject();
  }

  count(
    _preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageCountResult> {
    return Promise.resolve({
      count: 0,
      mode: "fast",
    });
  }

  findDocumentsById(
    _ids: string[],
    _withDeleted: boolean,
  ): Promise<RxDocumentData<RxDocType>[]> {
    return Promise.resolve([]);
  }

  getAttachmentData(
    _documentId: string,
    _attachmentId: string,
    _digest: string,
  ): Promise<string> {
    return Promise.resolve("");
  }

  getChangedDocumentsSince(
    _limit: number,
    _checkpoint: RxStoragePESQLiteCheckpoint,
  ): Promise<
    NotRxStorageChangedDocumentsSinceResult<
      RxDocType,
      RxStoragePESQLiteCheckpoint
    >
  > {
    return Promise.resolve({
      documents: [],
      checkpoint: new RxStoragePESQLiteCheckpoint("hello", 123.0),
    });
  }

  query(
    _preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageQueryResult<RxDocType>> {
    return Promise.resolve({
      documents: [],
    });
  }

  // Delete the database.
  async remove(): Promise<void> {
    // FIXME: Remove the database.
    return Promise.resolve();
  }
  resolveConflictResultionTask(
    taskSolution: RxConflictResultionTaskSolution<RxDocType>,
  ): Promise<void> {
    return Promise.resolve();
  }
}

export function createRxStoragePESQLiteInstance<RxDocType>(
  params: RxStorageInstanceCreationParams<
    RxDocType,
    RxStoragePESQLiteInstanceCreationOptions
  >,
): Promise<RxStoragePESQLiteInstance<RxDocType>> {
  const collectionName = params.collectionName;
  const databaseName = params.databaseName;
  const internals = new RxStoragePESQLiteInternals();
  const options = params.options;
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
