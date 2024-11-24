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
  FilledMangoQuery,
  RxDocumentData,
  RxJsonSchema,
  RxStorageQueryResult,
} from "rxdb";
import type { BulkWriteResponse, DocumentIdGetter } from "./types";

export interface RxStoragePESQLiteImpl {
  close(userKey: number): Promise<void>;
  addCollections<RxDocType>(
    collectionName: string,
    getDocumentId: DocumentIdGetter<RxDocType>,
    bulkWrites: BulkWriteRow<RxDocType>[],
  ): Promise<BulkWriteResponse<RxDocType>>;
  bulkWrite<RxDocType>(
    collectionName: string,
    getDocumentId: DocumentIdGetter<RxDocType>,
    bulkWrites: BulkWriteRow<RxDocType>[],
  ): Promise<BulkWriteResponse<RxDocType>>;
  init(databaseName: string, collectionName: string): Promise<number>;
  query<RxDocType>(
    collectionName: string,
    collectionSchema: RxJsonSchema<RxDocumentData<RxDocType>>,
    filledMangoQuery: FilledMangoQuery<RxDocType>,
  ): Promise<RxStorageQueryResult<RxDocType>>;
  removeCollection(collectionName: string): Promise<void>;
  whichBackend(): string;
}

export async function getDefaultSQLiteImpl(): Promise<RxStoragePESQLiteImpl> {
  const betterSQLite3ImplModule = await import("./storage-impl-better-sqlite3");
  return betterSQLite3ImplModule.getPESQLiteImplBetterSQLite3();
}
