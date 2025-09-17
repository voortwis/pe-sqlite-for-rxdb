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

export type SQLite3TableName = string;

export function assertIsSQLite3TableName(
  tableName: string,
): asserts tableName is SQLite3TableName {
  if (tableName.startsWith("sqlite_")) {
    throw new Error("Table names starting with 'sqlite_' are reserved.");
  }
  if (!isNaN(parseInt(tableName))) {
    throw new Error("Table names must not start with a number.");
  }
}
