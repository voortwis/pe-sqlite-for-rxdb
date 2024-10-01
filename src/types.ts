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

import type { JsonSchemaTypes, Paths, RxDocumentData, StringKeys } from "rxdb";

export interface ColumnInformation {
  column?: string;
  jsonPath?: string;
  type: JsonSchemaTypes | JsonSchemaTypes[] | readonly JsonSchemaTypes[];
}

export type ColumnMap<T> = Map<Paths<T>, ColumnInformation>;

export type DocumentIdGetter<RxDocType> = (
  document: RxDocumentData<RxDocType>,
) => RxDocumentData<RxDocType>[StringKeys<RxDocumentData<RxDocType>>];
