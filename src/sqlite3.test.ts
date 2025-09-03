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

import { describe, it, expect } from "vitest";
import { default as openDatabase } from "better-sqlite3";
import { assertIsSQLite3TableName } from "./sqlite3";

describe("assertIsSQLite3TableName tests", () => {
  it("rejects illegal table names", () => {
    expect(() => assertIsSQLite3TableName("sqlite_master")).toThrowError(
      "sqlite_",
    );
  });
});
describe("SQLite3 tests", () => {
  it("accepts table names in the required formats", () => {
    createTableAndIndexes("_rxdb_internal");
    createTableAndIndexes("rx-migration-state-meta-fooBar123-29909");
  });
});

function createTableAndIndexes(tableName: string): void {
  const connection = openDatabase(":memory:");
  const createTable1 = connection.prepare(
    [
      "CREATE TABLE '" + tableName + "'(\n",
      "\tid TEXT PRIMARY KEY NOT NULL\n",
      "\t,jsonb BLOB NOT NULL\n",
      "\t,deleted INTEGER NOT NULL\n",
      "\t,rev TEXT NOT NULL\n",
      "\t,mtime_ms REAL NOT NULL\n",
      ");",
    ].join(""),
  );
  createTable1.run();
  const createIndex1 = connection.prepare(
    [
      "CREATE INDEX 'idx_" + tableName + "_deleted_id'\n",
      "\tON '" + tableName + "'(deleted, id);",
    ].join(""),
  );
  try {
    createIndex1.run();
  } catch (err: unknown) {
    console.log(err);
  }
  const createIndex2 = connection.prepare(
    [
      "CREATE INDEX 'idx_" + tableName + "_mtime_ms_id'\n",
      "\tON '" + tableName + "'(mtime_ms, id);",
    ].join(""),
  );
  createIndex2.run();
}
