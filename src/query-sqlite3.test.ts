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

import type { FilledMangoQuery, RxDocumentData, RxJsonSchema } from "rxdb";
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
    expect(
      queryBuilder.queryAndArgsWithFilledMangoQuery(filledMangoQuery1),
    ).toEqual(expected);
  });
  it("finds all internal documents", () => {
    const expectedQuery =
      "WHERE jsonb ->> '$.context' = ? AND deleted = ? ORDER BY id ASC";
    const expectedArgs = ["collection", 0];
    const expected: QueryAndArgs = {
      args: expectedArgs,
      query: expectedQuery,
    };
    const queryBuilder = new RxStoragePESQLiteQueryBuilder(collectionSchema2);
    expect(
      queryBuilder.queryAndArgsWithFilledMangoQuery(filledMangoQuery2),
    ).toEqual(expected);
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
  it("joins conditions correctly with AND", () => {
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
    expect(queryBuilder["joinConditionsAnd"](conditions, 0)).toEqual(expected);
  });
  it("joins conditions correctly with OR", () => {
    const expected = {
      condition: "id = ? OR jsonb -> '$.done' = ? OR deleted = ?",
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
    expect(queryBuilder["joinConditionsOr"](conditions, 0)).toEqual(expected);
  });
  it("can handle all kinds of ANDs", () => {
    const expected = {
      query: "WHERE id = ? AND jsonb ->> '$.baz' = ? ORDER BY id ASC",
      args: ["bar", 42],
    };
    const queryBuilder = new RxStoragePESQLiteQueryBuilder(collectionSchema3);
    const query: FilledMangoQuery<TestRxDocType3> = {
      selector: { foo: "bar", baz: 42 },
      sort: [{ foo: "asc" as const }],
      skip: 0,
    };
    expect(queryBuilder.queryAndArgsWithFilledMangoQuery(query)).toEqual(
      expected,
    );
    query.selector = {
      $and: [{ foo: { $eq: "bar" } }, { baz: { $eq: 42 } }],
    };
    expect(queryBuilder.queryAndArgsWithFilledMangoQuery(query)).toEqual(
      expected,
    );
  });
  it("can order results", () => {
    const expected = {
      query: "WHERE deleted = ? ORDER BY id DESC, jsonb ->> '$.baz' ASC",
      args: [0],
    };
    const queryBuilder = new RxStoragePESQLiteQueryBuilder(collectionSchema3);
    const query: FilledMangoQuery<TestRxDocType3> = {
      selector: { _deleted: false },
      sort: [{ foo: "desc" as const }, { baz: "asc" as const }],
      skip: 0,
    };
    expect(queryBuilder.queryAndArgsWithFilledMangoQuery(query)).toEqual(
      expected,
    );
  });
  it("can query values IN an array", () => {
    // color is the primary key.
    const expected1 = {
      query: "WHERE id IN (?, ?, ?) ORDER BY id ASC",
      args: ["blue", "red", "green"],
    };
    const queryBuilder1 = new RxStoragePESQLiteQueryBuilder(color1Schema);
    const query1: FilledMangoQuery<TestColor1Type> = {
      selector: { color: { $in: ["blue", "red", "green"] } },
      sort: [{ color: "asc" as const }],
      skip: 0,
    };
    expect(queryBuilder1.queryAndArgsWithFilledMangoQuery(query1)).toEqual(
      expected1,
    );
    // Now, where color is not the primary key.
    const expected2 = {
      query:
        "WHERE jsonb ->> '$.color' IN (?, ?, ?) ORDER BY jsonb ->> '$.color' DESC",
      args: ["blue", "red", "green"],
    };
    const queryBuilder2 = new RxStoragePESQLiteQueryBuilder(color2Schema);
    const query2: FilledMangoQuery<TestColor2Type> = {
      selector: { color: { $in: ["blue", "red", "green"] } },
      sort: [{ color: "desc" as const }],
      skip: 0,
    };
    expect(queryBuilder2.queryAndArgsWithFilledMangoQuery(query2)).toEqual(
      expected2,
    );
  });
  it("can compare values with > and >=", () => {
    // color is the primary key.
    const expected1 = {
      query: "WHERE mtime_ms > ? ORDER BY id ASC",
      args: [100],
    };
    const queryBuilder1 = new RxStoragePESQLiteQueryBuilder(color1Schema);
    const query1: FilledMangoQuery<TestColor1Type> = {
      selector: { "_meta.lwt": { $gt: 100 } },
      sort: [{ color: "asc" as const }],
      skip: 0,
    };
    expect(queryBuilder1.queryAndArgsWithFilledMangoQuery(query1)).toEqual(
      expected1,
    );
    // Now, where color is not the primary key.
    const expected2 = {
      query: "WHERE jsonb ->> '$.color' >= ? ORDER BY mtime_ms DESC",
      args: ["blue"],
    };
    const queryBuilder2 = new RxStoragePESQLiteQueryBuilder(color2Schema);
    const query2: FilledMangoQuery<TestColor2Type> = {
      selector: { color: { $gte: "blue" } },
      sort: [{ "_meta.lwt": "desc" as const }],
      skip: 0,
    };
    expect(queryBuilder2.queryAndArgsWithFilledMangoQuery(query2)).toEqual(
      expected2,
    );
  });
  it("can compare values with < and <=", () => {
    // color is the primary key.
    const expected1 = {
      query: "WHERE mtime_ms < ? ORDER BY id ASC",
      args: [100],
    };
    const queryBuilder1 = new RxStoragePESQLiteQueryBuilder(color1Schema);
    const query1: FilledMangoQuery<TestColor1Type> = {
      selector: { "_meta.lwt": { $lt: 100 } },
      sort: [{ color: "asc" as const }],
      skip: 0,
    };
    expect(queryBuilder1.queryAndArgsWithFilledMangoQuery(query1)).toEqual(
      expected1,
    );
    // Now, where color is not the primary key.
    const expected2 = {
      query: "WHERE jsonb ->> '$.color' <= ? ORDER BY mtime_ms DESC",
      args: ["blue"],
    };
    const queryBuilder2 = new RxStoragePESQLiteQueryBuilder(color2Schema);
    const query2: FilledMangoQuery<TestColor2Type> = {
      selector: { color: { $lte: "blue" } },
      sort: [{ "_meta.lwt": "desc" as const }],
      skip: 0,
    };
    expect(queryBuilder2.queryAndArgsWithFilledMangoQuery(query2)).toEqual(
      expected2,
    );
  });
  it("can ask for one set of conditions OR another", () => {
    // color is the primary key.
    const expected1 = {
      query: "WHERE mtime_ms > ? OR (id > ? AND mtime_ms = ?) ORDER BY id ASC",
      args: [10, "blue", 10],
    };
    const queryBuilder1 = new RxStoragePESQLiteQueryBuilder(color1Schema);
    const query1: FilledMangoQuery<TestColor1Type> = {
      selector: {
        $or: [
          { "_meta.lwt": { $gt: 10 } },
          { color: { $gt: "blue" }, _meta: { lwt: 10 } },
        ],
      },
      sort: [{ color: "asc" as const }],
      skip: 0,
    };
    expect(queryBuilder1.queryAndArgsWithFilledMangoQuery(query1)).toEqual(
      expected1,
    );
    // Now, where color is not the primary key.
    const expected2 = {
      query:
        "WHERE mtime_ms > ? OR (jsonb ->> '$.color' > ? AND mtime_ms = ?) ORDER BY jsonb ->> '$.color' DESC",
      args: [10, "blue", 10],
    };
    const queryBuilder2 = new RxStoragePESQLiteQueryBuilder(color2Schema);
    const query2: FilledMangoQuery<TestColor2Type> = {
      selector: {
        $or: [
          { _meta: { lwt: { $gt: 10 } } },
          { color: { $gt: "blue" }, "_meta.lwt": 10 },
        ],
      },
      sort: [{ color: "desc" as const }],
      skip: 0,
    };
    expect(queryBuilder2.queryAndArgsWithFilledMangoQuery(query2)).toEqual(
      expected2,
    );
  });
  it("can group logical expressions with parentheses", () => {
    // color is the primary key.
    const expected1 = {
      query:
        "WHERE mtime_ms > ? OR (id > ? AND mtime_ms = ?) OR (deleted = ? AND (id <= ? OR id = ? OR id = ?)) ORDER BY id ASC",
      args: [10, "blue", 10, 1, "orange", "green", "yellow"],
    };
    const queryBuilder1 = new RxStoragePESQLiteQueryBuilder(color1Schema);
    const query1: FilledMangoQuery<TestColor1Type> = {
      selector: {
        $or: [
          { "_meta.lwt": { $gt: 10 } },
          { color: { $gt: "blue" }, _meta: { lwt: 10 } },
          {
            _deleted: true,
            $or: [
              { color: { $lte: "orange" } },
              { color: "green" },
              { color: "yellow" },
            ],
          },
        ],
      },
      sort: [{ color: "asc" as const }],
      skip: 0,
    };
    expect(queryBuilder1.queryAndArgsWithFilledMangoQuery(query1)).toEqual(
      expected1,
    );
    // Because of order of operations, the top-level parentheses around the
    // (mtime_ms > ?... OR id = ?)) are not strictly necessary.  I appreciate
    // that they reduce the mental load on the developer.
    const expected2 = {
      query:
        "WHERE (mtime_ms > ? AND (id = ? OR (id = ? AND mtime_ms >= ?) OR id = ?)) OR id = ? ORDER BY id ASC",
      args: [10, "pink", "purple", 15, "orange", "yellow"],
    };
    const queryBuilder2 = new RxStoragePESQLiteQueryBuilder(color1Schema);
    const query2: FilledMangoQuery<TestColor1Type> = {
      selector: {
        $or: [
          {
            _meta: { lwt: { $gt: 10 } },
            $or: [
              { color: "pink" },
              { color: "purple", "_meta.lwt": { $gte: 15 } },
              { color: "orange" },
            ],
          },
          { color: "yellow" },
        ],
      },
      sort: [{ color: "asc" as const }],
      skip: 0,
    };
    expect(queryBuilder2.queryAndArgsWithFilledMangoQuery(query2)).toEqual(
      expected2,
    );
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

const filledMangoQuery1: FilledMangoQuery<RxDocumentData<TestRxDocType1>> = {
  selector: { done: { $eq: false }, _deleted: { $eq: false } },
  sort: [{ id: "asc" }],
  skip: 0,
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
const filledMangoQuery2: FilledMangoQuery<RxDocumentData<TestRxDocType2>> = {
  selector: { context: "collection", _deleted: { $eq: false } },
  sort: [{ id: "asc" }],
  skip: 0,
};

interface TestRxDocType3 {
  foo: string;
  baz: number;
}

const collectionSchema3: RxJsonSchema<RxDocumentData<TestRxDocType3>> = {
  version: 0,
  primaryKey: "foo",
  type: "object",
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
    foo: { type: "string", maxLength: 10 },
    baz: { type: "number" },
  },
  indexes: [
    ["_deleted", "foo"],
    ["_meta.lwt", "foo"],
  ],
  required: ["foo", "baz", "_deleted", "_rev", "_meta", "_attachments"],
  additionalProperties: false,
  sharding: { shards: 1, mode: "collection" },
  keyCompression: false,
  encrypted: [],
};

interface TestColor1Type {
  color: string;
}

const color1Schema: RxJsonSchema<RxDocumentData<TestColor1Type>> = {
  version: 0,
  primaryKey: "color",
  type: "object",
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
    color: { type: "string", maxLength: 10 },
  },
  indexes: [
    ["_deleted", "color"],
    ["_meta.lwt", "color"],
  ],
  required: ["color", "_deleted", "_rev", "_meta", "_attachments"],
  additionalProperties: false,
  sharding: { shards: 1, mode: "collection" },
  keyCompression: false,
  encrypted: [],
};

interface TestColor2Type {
  pk: string;
  color: string;
}

const color2Schema: RxJsonSchema<RxDocumentData<TestColor2Type>> = {
  version: 0,
  primaryKey: "pk",
  type: "object",
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
    color: { type: "string", maxLength: 10 },
    pk: { type: "string", maxLength: 10 },
  },
  indexes: [
    ["_deleted", "pk"],
    ["_meta.lwt", "pk"],
  ],
  required: ["color", "_deleted", "pk", "_rev", "_meta", "_attachments"],
  additionalProperties: false,
  sharding: { shards: 1, mode: "collection" },
  keyCompression: false,
  encrypted: [],
};
