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

import type { PreparedQuery } from "rxdb";

import { describe, expect, it } from "vitest";
import { RxStoragePESQLiteQueryBuilder } from "./query-sqlite3";

describe("query-sqlite3 tests", () => {
  it("finds all internal documents", () => {
    const preparedQuery: PreparedQuery<RxDocType> = {
      query: {
        selector: { context: "collection", _deleted: { $eq: false } },
        sort: [{ id: "asc" }],
        skip: 0,
      },
      queryPlan: {
        index: ["_deleted", "id"],
        startKeys: [false, -9007199254740991],
        endKeys: [false, "￿"],
        inclusiveEnd: true,
        inclusiveStart: true,
        sortSatisfiedByIndex: true,
        selectorSatisfiedByIndex: false,
      },
    };

    const whereClause =
      "WHERE deleted = 0 AND context = 'collection' ORDER BY id ASC";
    const queryBuilder = new RxStoragePESQLiteQueryBuilder(preparedQuery);
    expect(queryBuilder.whereClause).toEqual(whereClause);
  });
});
