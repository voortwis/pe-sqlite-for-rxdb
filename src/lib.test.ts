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
import type {
  ExtractDocumentTypeFromTypedRxJsonSchema,
  RxChangeEventInsert,
  RxJsonSchema,
} from "rxdb";
import type { RxStoragePESQLite } from "./lib";

import { addRxPlugin, createRxDatabase, toTypedRxJsonSchema } from "rxdb";
import { describe, expect, it } from "vitest";
import { getInternalsWithImpl, getRxStoragePESQLite } from "./lib";

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
    // See the RxDB TypeScript Tutorial for types:
    // https://rxdb.info/tutorials/typescript.html
    const todoSchemaLiteral = {
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
    } as const;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const schemaTyped = toTypedRxJsonSchema(todoSchemaLiteral);
    type TodoDocType = ExtractDocumentTypeFromTypedRxJsonSchema<
      typeof schemaTyped
    >;
    const todoSchema: RxJsonSchema<TodoDocType> = todoSchemaLiteral;

    expect(myDatabase.todos).toBeFalsy();
    // Adding an RxCollection to the RxDatabase
    await myDatabase.addCollections({
      todos: {
        schema: todoSchema,
      },
    });
    expect(myDatabase.todos).toBeTruthy();

    //
    // Write Operations
    //

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

    // Updating a document
    expect(myDocument.done).toBe(false);
    const updatedMyDocument = await myDocument.patch({
      done: true,
    });
    expect(updatedMyDocument.done).toBe(true);

    const myDocument2 = await myDatabase.todos.insert({
      id: "todo2",
      name: "Make the quickstart work",
      done: false,
      timestamp: new Date().toISOString(),
    });
    expect(myDocument2.isInstanceOfRxDocument).toBeTruthy();
    const mapOfDocuments2 = await myDatabase.todos.findByIds(["todo2"]).exec();
    expect(mapOfDocuments2.get("todo2")).toBeTruthy();

    expect(myDocument2.done).toBe(false);
    const updatedMyDocument2 = await myDocument2.modify(
      (docData: TodoDocType) => {
        docData.done = true;
        return docData;
      },
    );
    expect(updatedMyDocument2.done).toBe(true);

    await myDatabase.todos.insert({
      id: "todo3",
      name: "Make the quickstart tests work",
      done: false,
      timestamp: new Date().toISOString(),
    });

    // Delete a document
    const deletedMyDocument2 = await updatedMyDocument.remove();
    expect(deletedMyDocument2._deleted).toBe(true);
    expect(parseInt(deletedMyDocument2._rev)).toBe(3);

    //
    // Query Operations
    //

    // Simple Query
    const foundDocuments = await myDatabase.todos
      .find({
        selector: {
          done: {
            $eq: false,
          },
        },
      })
      .exec();
    expect(foundDocuments.length).toEqual(1);
  });
  it("accepts options for better-sqlite3", async () => {
    const betterSQLite3ImplModule = await import(
      "./storage-impl-better-sqlite3"
    );
    const betterSQLite3Options: DatabaseOptions = {
      readonly: false, // default: false
      fileMustExist: false, // default: false
      timeout: 5000, // default: 5000, in milliseconds
      verbose: undefined, // default: undefined, logging function: (string) => void;
      //      nativeBinding: "node_modules/better-sqlite3/build/Release", // path to better_sqlite3.node if not found
    };
    const databaseName = "my_database";
    const fileName = "my_database.sqlite3";
    const databaseStorage = getRxStoragePESQLite({
      sqliteInternals: getInternalsWithImpl(
        betterSQLite3ImplModule.getPESQLiteImplBetterSQLite3(
          fileName,
          betterSQLite3Options,
        ),
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
  it("can add multiple collections at once", async () => {
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
    const collection1Schema = {
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
      },
      required: ["id", "name"],
    };
    const collection2Schema = Object.assign({}, collection1Schema);

    const addCollectionsObject = {
      collection1: {
        schema: collection1Schema,
      },
      collection2: {
        schema: collection2Schema,
      },
    };

    expect(myDatabase.collection1).toBeFalsy();
    expect(myDatabase.collection2).toBeFalsy();
    // Adding two RxCollections to the RxDatabase
    await myDatabase.addCollections(addCollectionsObject);
    expect(myDatabase.collection1).toBeTruthy();
    expect(myDatabase.collection2).toBeTruthy();

    // Removing the collections
    await myDatabase.collection1.remove();
    expect(myDatabase.collection1).toBeFalsy();
    await myDatabase.collection2.remove();
    expect(myDatabase.collection2).toBeFalsy();
  });
  it("reports changes", async () => {
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
    const thingSchema = {
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
      },
      required: ["id", "name"],
    };
    interface RxDocType {
      id: string;
      name: string;
    }
    await myDatabase.addCollections({
      thing: {
        schema: thingSchema,
      },
    });
    const generalSubscriptionPromise = new Promise((resolve) => {
      const subscription = myDatabase.thing.$.subscribe((changeEvent) => {
        subscription.unsubscribe();
        resolve(changeEvent);
      });
    });
    const generalSubscriptionExpect = expect(
      generalSubscriptionPromise,
    ).resolves.toMatchObject({
      collectionName: "thing",
      isLocal: false,
      operation: "INSERT",
    });
    const insertSubscriptionPromise = new Promise((resolve) => {
      const subscription = myDatabase.thing.insert$.subscribe(
        (insertEvent: RxChangeEventInsert<RxDocType>) => {
          subscription.unsubscribe();
          resolve(insertEvent);
        },
      );
    });
    const insertSubscriptionCheck = insertSubscriptionPromise.then(
      (value: unknown) => {
        const insertEvent = value as RxChangeEventInsert<RxDocType>;
        expect(insertEvent).toMatchObject({
          collectionName: "thing",
          isLocal: false,
          operation: "INSERT",
        });
        expect(insertEvent.documentId).toMatch(/[123]/);
      },
    );
    const updateSubscriptionPromise = new Promise((resolve) => {
      const subscription = myDatabase.thing.update$.subscribe((updateEvent) => {
        subscription.unsubscribe();
        resolve(updateEvent);
      });
    });
    const updateSubscriptionExpect = expect(
      updateSubscriptionPromise,
    ).resolves.toMatchObject({
      collectionName: "thing",
      isLocal: false,
      operation: "UPDATE",
      documentId: "2",
      documentData: {
        id: "2",
        name: "two, updated",
      },
    });
    const removeSubscriptionPromise = new Promise((resolve) => {
      myDatabase.thing.remove$.subscribe((removeEvent) => {
        resolve(removeEvent);
      });
    });
    const removeSubscriptionExpect = expect(
      removeSubscriptionPromise,
    ).resolves.toMatchObject({
      collectionName: "thing",
      isLocal: false,
      operation: "DELETE",
      documentId: "2",
      documentData: {
        id: "2",
        name: "two, updated",
      },
    });
    await myDatabase.thing.bulkInsert([
      {
        id: "1",
        name: "one",
      },
      {
        id: "2",
        name: "two",
      },
      {
        id: "3",
        name: "three",
      },
    ]);
    const upsertResult = await myDatabase.thing.upsert({
      id: "2",
      name: "two, updated",
    });
    await upsertResult.remove();
    await insertSubscriptionCheck;
    await myDatabase.thing.remove();
    await generalSubscriptionExpect;
    await updateSubscriptionExpect;
    await removeSubscriptionExpect;
  });
  it("can get documents by an identifier", async () => {
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
    const thing2Schema = {
      version: 0,
      primaryKey: "identifier",
      type: "object",
      properties: {
        identifier: {
          type: "string",
          maxLength: 100,
        },
        name: {
          type: "string",
        },
      },
      required: ["identifier", "name"],
    };
    await myDatabase.addCollections({
      thing2: {
        schema: thing2Schema,
      },
    });
    await myDatabase.thing2.bulkInsert([
      {
        identifier: "3",
        name: "three",
      },
    ]);
    const docMap = await myDatabase.thing2.findByIds(["3"]).exec();
    const three = docMap.get("3");
    expect(three).toMatchObject({ identifier: "3", name: "three" });
  });
});
