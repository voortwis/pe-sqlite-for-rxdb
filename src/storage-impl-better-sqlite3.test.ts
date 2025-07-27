// pe-sqlite-for-rxdb
// Copyright 2025 Pineapple Electric LLC
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

import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { addRxPlugin, createRxDatabase } from "rxdb";
import { describe, expect, it } from "vitest";
import { getRxStoragePESQLite } from "./storage";
import { getInternalsWithImpl } from "./storage-internals";
import { getPESQLiteImplBetterSQLite3 } from "./storage-impl-better-sqlite3";

import { RxDBDevModePlugin } from "rxdb/plugins/dev-mode";
addRxPlugin(RxDBDevModePlugin);

describe("pe-sqlite-for-rxdb/storage-impl-better-sqlite3 tests", () => {
  it("can open a database with a path", async ({ onTestFinished }) => {
    // This test shows that an error, where paths passed to the
    // PESQLiteImplBetterSQLite3 were being ignored, is fixed.
    const directory = await mkdtemp("storage-impl-better-sqlite3-1");
    onTestFinished(() => rm(directory, { recursive: true, force: true }));
    const dbName = "storage-impl-better-sqlite3-1";
    const dbPath = join(directory, dbName) + ".sqlite3";
    const impl = getPESQLiteImplBetterSQLite3(dbPath);

    await createRxDatabase({
      ignoreDuplicate: true, // for unit tests only; do not copy this to working code.
      name: dbName,
      multiInstance: false,
      storage: getRxStoragePESQLite({
        sqliteInternals: getInternalsWithImpl(impl),
      }),
    });
    const tempStat = await stat(dbPath);
    expect(tempStat).toBeTruthy();
  });
});
