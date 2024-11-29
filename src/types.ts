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
  JsonSchemaTypes,
  Paths,
  RxDocumentData,
  RxStorageWriteError,
  StringKeys,
} from "rxdb";

export type BulkWriteResponse<RxDocType> = {
  success: Map<RxDocType[StringKeys<RxDocType>], RxDocumentData<RxDocType>>;
  error: Array<RxStorageWriteError<RxDocType>>;
};

export interface ColumnInformation {
  column?: string;
  jsonPath?: string;
  type: JsonSchemaTypes | JsonSchemaTypes[] | readonly JsonSchemaTypes[];
}

export type ColumnMap<T> = Map<Paths<T>, ColumnInformation>;

export type DocumentIdGetter<RxDocType> = (
  document: RxDocType,
) => RxDocType[StringKeys<RxDocType>];

export type SQLQueryOperator = "=" | ">" | ">=";

export function isSQLQueryOperator(
  probably: unknown,
): probably is SQLQueryOperator {
  return probably === "=" || probably === ">" || probably === ">=";
}

export type SupportedMangoQueryOperator = "$eq" | "$gt" | "$gte";

export function isSupportedMangoQueryOperator(
  probably: unknown,
): probably is SupportedMangoQueryOperator {
  return probably === "$eq" || probably === "$gt" || probably === "$gte";
}
