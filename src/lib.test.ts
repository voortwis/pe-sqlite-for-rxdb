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

import type { Options as DatabaseOptions } from "better-sqlite3";
import type { RxStoragePESQLite } from "./lib";

import { addRxPlugin, createRxDatabase } from "rxdb";
import { describe, expect, it } from "vitest";
import {
  getInternalsWithImpl,
  getPESQLiteImplBetterSQLite3,
  getRxStoragePESQLite,
} from "./lib";

import { RxDBDevModePlugin } from "rxdb/plugins/dev-mode";
addRxPlugin(RxDBDevModePlugin);

describe("pe-sqlite-for-rxdb tests", () => {
  it("quickstart works", async () => {
    // Create the RxDatabase
    const myDatabase = await createRxDatabase({
      name: "my_database",
      multiInstance: false,
      storage: getRxStoragePESQLite(),
    });
    expect(myDatabase).toBeTruthy();

    // Create an RxCollection
    // Creating a schema for a collection
    const todoSchema = {
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: {
          type: "string",
          maxLength: 100,
        },
        name: {
          type: "string",
        },
        done: {
          type: "boolean",
        },
        timestamp: {
          type: "string",
          format: "date-time",
        },
      },
      required: ["id", "name", "done", "timestamp"],
    };

    expect(myDatabase.todos).toBeFalsy();
    // Adding an RxCollection to the RxDatabase
    await myDatabase.addCollections({
      todos: {
        schema: todoSchema,
      },
    });
    expect(myDatabase.todos).toBeTruthy();

    // Inserting a document
    const myDocument = await myDatabase.todos.insert({
      id: "todo1",
      name: "Learn RxDB",
      done: false,
      timestamp: new Date().toISOString(),
    });
    expect(myDocument.isInstanceOfRxDocument).toBeTruthy();
    const mapOfDocuments = await myDatabase.todos.findByIds(["todo1"]).exec();
    expect(mapOfDocuments.get("todo1")).toBeTruthy();
  });
  it("accepts options for better-sqlite3", async () => {
    const betterSQLite3Options: DatabaseOptions = {
      readonly: false, // default: false
      fileMustExist: false, // default: false
      timeout: 5000, // default: 5000, in milliseconds
      verbose: undefined, // default: undefined, logging function: (string) => void;
      nativeBinding: "node_modules/better-sqlite3/build/release", // path to better_sqlite3.node if not found
    };
    const databaseName = "my_database";
    const databaseStorage = getRxStoragePESQLite({
      sqliteInternals: getInternalsWithImpl(
        getPESQLiteImplBetterSQLite3(betterSQLite3Options),
      ),
    });

    const myDatabase = await createRxDatabase({
      ignoreDuplicate: true, // for unit tests only; do not copy this to working code.
      instanceCreationOptions: {},
      multiInstance: false,
      name: databaseName,
      storage: databaseStorage,
    });
    expect(myDatabase).toBeTruthy();
  });
  it("uses better-sqlite3 by default", async () => {
    const databaseName = "my_database";
    const databaseStorage = getRxStoragePESQLite();

    const myDatabase = await createRxDatabase({
      ignoreDuplicate: true, // for unit tests only; do not copy this to working code.
      multiInstance: false,
      name: databaseName,
      storage: databaseStorage,
    });
    expect(myDatabase).toBeTruthy();
    expect(myDatabase.storage).toBeTruthy();
    const betterSQLite3Storage = myDatabase.storage as RxStoragePESQLite;
    expect(betterSQLite3Storage.whichBackend()).resolves.toEqual(
      "better-sqlite3",
    );
  });
  it("can add, remove and re-add collections", async () => {
    // Create the RxDatabase
    const myDatabase = await createRxDatabase({
      ignoreDuplicate: true, // for unit tests only; do not copy this to working code.
      name: "my_database",
      multiInstance: false,
      storage: getRxStoragePESQLite(),
    });
    expect(myDatabase).toBeTruthy();

    // Create an RxCollection
    // Creating a schema for a collection
    const todoSchema = {
      version: 0,
      primaryKey: "id",
      type: "object",
      properties: {
        id: {
          type: "string",
          maxLength: 100,
        },
        name: {
          type: "string",
        },
        done: {
          type: "boolean",
        },
        timestamp: {
          type: "string",
          format: "date-time",
        },
      },
      required: ["id", "name", "done", "timestamp"],
    };

    const addCollectionsObject = {
      todos: {
        schema: todoSchema,
      },
    };

    expect(myDatabase.todos).toBeFalsy();
    // Adding an RxCollection to the RxDatabase
    await myDatabase.addCollections(addCollectionsObject);
    expect(myDatabase.todos).toBeTruthy();

    // Removing the collection
    await myDatabase.todos.remove();
    expect(myDatabase.todos).toBeFalsy();

    // Re-adding an RxCollection to the RxDatabase
    await myDatabase.addCollections(addCollectionsObject);
    expect(myDatabase.todos).toBeTruthy();

    // Re-deleteing the collection
    await myDatabase.todos.remove();
    expect(myDatabase.todos).toBeFalsy();
  });
});
