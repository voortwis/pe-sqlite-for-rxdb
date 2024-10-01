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

import type { PreparedQuery, RxDocumentData, RxJsonSchema } from "rxdb";
import type { QueryAndArgs } from "./query-sqlite3";

import { describe, expect, it } from "vitest";
import { RxStoragePESQLiteQueryBuilder } from "./query-sqlite3";

describe("query-sqlite3 tests", () => {
  it("finds one todo document from the quickstart", () => {
    const expectedQuery =
      "WHERE jsonb -> '$.done' = ? AND deleted = ? ORDER BY id ASC";
    const expectedArgs = ["false", 0];
    const expected: QueryAndArgs = {
      args: expectedArgs,
      query: expectedQuery,
    };
    const queryBuilder = new RxStoragePESQLiteQueryBuilder(collectionSchema1);
    expect(queryBuilder.queryAndArgsWithPreparedQuery(preparedQuery1)).toEqual(
      expected,
    );
  });
  it("finds all internal documents", () => {
    // FIXME: This should use the context column.
    const expectedQuery =
      "WHERE jsonb ->> '$.context' = ? AND deleted = ? ORDER BY id ASC";
    const expectedArgs = ["collection", 0];
    const expected: QueryAndArgs = {
      args: expectedArgs,
      query: expectedQuery,
    };
    const queryBuilder = new RxStoragePESQLiteQueryBuilder(collectionSchema2);
    expect(queryBuilder.queryAndArgsWithPreparedQuery(preparedQuery2)).toEqual(
      expected,
    );
  });
  it("builds a column information map correctly", () => {
    const expected = new Map([
      ["_deleted", { column: "deleted", type: "boolean" }],
      ["_rev", { column: "rev", type: "string" }],
      ["id", { column: "id", type: "string" }],
      ["_meta.lwt", { column: "mtime_ms", type: "number" }],
      ["done", { jsonPath: "$.done", type: "boolean" }],
      ["name", { jsonPath: "$.name", type: "string" }],
      ["timestamp", { jsonPath: "$.timestamp", type: "string" }],
    ]);
    const queryBuilder = new RxStoragePESQLiteQueryBuilder(collectionSchema1);
    expect(queryBuilder.columnMap).toEqual(expected);
  });
  it("joins conditions correctly", () => {
    const expected = {
      condition: "id = ? AND jsonb -> '$.done' = ? AND deleted = ?",
      args: [12345, "false", 0],
    };
    const conditions = [
      {
        condition: "id = ?",
        args: [12345],
      },
      {
        condition: "jsonb -> '$.done' = ?",
        args: ["false"],
      },
      {
        condition: "deleted = ?",
        args: [0],
      },
    ];
    const queryBuilder = new RxStoragePESQLiteQueryBuilder(collectionSchema1);
    expect(queryBuilder["joinConditions"](conditions)).toEqual(expected);
  });
});

interface TestRxDocType1 {
  done: boolean;
  id: string;
  name: string;
  timestamp: string;
}

const collectionSchema1: RxJsonSchema<RxDocumentData<TestRxDocType1>> = {
  additionalProperties: false,
  encrypted: [],
  indexes: [
    ["_deleted", "id"],
    ["_meta.lwt", "id"],
  ],
  keyCompression: false,
  primaryKey: "id",
  properties: {
    _attachments: { type: "object" },
    _deleted: { type: "boolean" },
    _meta: {
      additionalProperties: true,
      properties: {
        lwt: {
          maximum: 1000000000000000,
          minimum: 1,
          multipleOf: 0.01,
          type: "number",
        },
      },
      required: ["lwt"],
      type: "object",
    },
    _rev: { minLength: 1, type: "string" },
    done: { type: "boolean" },
    id: { maxLength: 100, type: "string" },
    name: { type: "string" },
    timestamp: { format: "date-time", type: "string" },
  },
  required: [
    "id",
    "name",
    "done",
    "timestamp",
    "_deleted",
    "_rev",
    "_meta",
    "_attachments",
  ],
  type: "object",
  version: 0,
};

const preparedQuery1: PreparedQuery<RxDocumentData<TestRxDocType1>> = {
  query: {
    selector: { done: { $eq: false }, _deleted: { $eq: false } },
    sort: [{ id: "asc" }],
    skip: 0,
  },
  queryPlan: {
    index: ["_deleted", "id"],
    startKeys: [undefined, -9007199254740991],
    endKeys: [undefined, "￿"],
    inclusiveEnd: true,
    inclusiveStart: true,
    sortSatisfiedByIndex: true,
    selectorSatisfiedByIndex: false,
  },
};

interface TestRxDocType2 {
  context: "collection" | "storage-token" | "rx-migration-status" | "OTHER";
  id: string;
  key: string;
  data: object;
}

const collectionSchema2: RxJsonSchema<RxDocumentData<TestRxDocType2>> = {
  version: 0,
  title: "RxInternalDocument",
  primaryKey: { key: "id", fields: ["context", "key"], separator: "|" },
  type: "object",
  properties: {
    id: { type: "string", maxLength: 200 },
    key: { type: "string" },
    context: {
      type: "string",
      enum: ["collection", "storage-token", "rx-migration-status", "OTHER"],
    },
    data: { type: "object", additionalProperties: true },
    _rev: { type: "string", minLength: 1 },
    _attachments: { type: "object" },
    _deleted: { type: "boolean" },
    _meta: {
      type: "object",
      properties: {
        lwt: {
          type: "number",
          minimum: 1,
          maximum: 1000000000000000,
          multipleOf: 0.01,
        },
      },
      additionalProperties: true,
      required: ["lwt"],
    },
  },
  indexes: [
    ["_deleted", "id"],
    ["_meta.lwt", "id"],
  ],
  required: [
    "key",
    "context",
    "data",
    "_deleted",
    "_rev",
    "_meta",
    "_attachments",
    "id",
  ],
  additionalProperties: false,
  sharding: { shards: 1, mode: "collection" },
  keyCompression: false,
  encrypted: [],
};
const preparedQuery2: PreparedQuery<RxDocumentData<TestRxDocType2>> = {
  query: {
    selector: { context: "collection", _deleted: { $eq: false } },
    sort: [{ id: "asc" }],
    skip: 0,
  },
  queryPlan: {
    index: ["_deleted", "id"],
    startKeys: [undefined, -9007199254740991],
    endKeys: [undefined, "￿"],
    inclusiveEnd: true,
    inclusiveStart: true,
    sortSatisfiedByIndex: true,
    selectorSatisfiedByIndex: false,
  },
};
