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

import { createRxDatabase } from "rxdb";
import { describe, expect, it } from "vitest";
import { getRxStoragePESQLite } from "./lib";

describe("pe-sqlite-for-rxdb tests", () => {
  it("quickstart works", async () => {
    // Create the RxDatabase
    const myDatabase = await createRxDatabase({
      name: "myDatabase",
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

    // Adding an RxCollection to the RxDatabase
    await myDatabase.addCollections({
      todos: {
        schema: todoSchema,
      },
    });
  });
});
