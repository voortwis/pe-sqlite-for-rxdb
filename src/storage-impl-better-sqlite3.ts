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

import type {
  BulkWriteRow,
  PreparedQuery,
  RxDocumentData,
  RxStorageQueryResult,
  RxStorageWriteError,
  RxStorageBulkWriteResponse,
} from "rxdb";
import type {
  RxStoragePESQLiteImpl,
  RxStoragePESQLiteImplOptions,
} from "./storage-impl";
import type {
  DocumentIdGetter,
} from "./types";

import {
  default as openDatabase,
  Database as DatabaseInterface,
  Options as DatabaseOptions,
} from "better-sqlite3";
import { RxStoragePESQLiteQueryBuilder } from "./query-sqlite3";

const RXDB_INTERNAL_TABLE = "_rxdb_internal";

interface SqliteError extends Error {
  name: string;
  message: string;
  code: "SQLITE_ERROR";
}

function isSqliteError(probableError: unknown): probableError is SqliteError {
  const err: SqliteError = probableError as SqliteError;
  return (
    typeof err.name === "string" &&
    typeof err.message === "string" &&
    (err.code === "SQLITE_ERROR" || err.code === "SQLITE_CONSTRAINT_PRIMARYKEY")
  );
}

export class RxStoragePESQLiteImplBetterSQLite3
  implements RxStoragePESQLiteImpl
{
  private connection?: DatabaseInterface;
  private userMap: Map<number, string> = new Map();

  constructor(private readonly databaseOptions: DatabaseOptions) {}

  async addCollection<RxDocType>(
    collectionName: string,
    getDocumentId: DocumentIdGetter<RxDocType>,
    bulkWrites: BulkWriteRow<RxDocType>[],
  ): Promise<RxStorageBulkWriteResponse<RxDocType>> {
    try {
      this.throwIfNoConnection();
      if (bulkWrites.length !== 1) {
        throw new Error("addCollection() should only insert one document");
      }

      const bulkWriteResult = await this.bulkWrite(
        collectionName,
        getDocumentId,
        bulkWrites,
      );
      if (
        bulkWriteResult.success.length == 0 &&
        bulkWriteResult.error.length == 1
      ) {
        return Promise.resolve(bulkWriteResult);
      }
      const collectionDocument = bulkWrites[0].document;
      const collectionTableName = this.getTableNameWithCollectionName(
        collectionDocument.data.name,
      );
      createDocumentTableAndIndexsWithTableName(
        this.connection,
        collectionTableName,
      );

      return Promise.resolve(bulkWriteResult);
    } catch (err: unknown) {
      return Promise.reject(err);
    }
  }

  bulkWrite<RxDocType>(
    collectionName: string,
    getDocumentId: (document: RxDocumentData<RxDocType>) => string,
    bulkWrites: BulkWriteRow<RxDocType>[],
  ): Promise<RxStorageBulkWriteResponse<RxDocType>> {
    try {
      this.throwIfNoConnection();

      const error: RxStorageWriteError<RxDocType>[] = [];
      const hasContextColumn = collectionName == RXDB_INTERNAL_TABLE;
      // success will go away in a later version of the interface.
      const success: RxDocumentData<RxDocType>[] = [];
      const tableName = this.getTableNameWithCollectionName(collectionName);

      for (let writeIndex = 0; writeIndex < bulkWrites.length; writeIndex++) {
        const currentWrite = bulkWrites[writeIndex];
        const newVersionOfDocument = currentWrite.document;
        const previousVersionOfDocument = currentWrite.previous;

        const sqlPart1 = [
          `INSERT INTO ${tableName}(\n`,
          "\tid\n",
          "\t,jsonb\n",
          "\t,deleted\n",
          "\t,rev\n",
          "\t,mtime_ms\n",
          hasContextColumn ? "\t,context\n" : "",
          ") VALUES (\n",
          "\t?, jsonb(?), ?, ?, ?" + (hasContextColumn ? ", ?" : "") + "\n",
          ")\n",
        ].join("");
        const sqlPart2 = [
          "ON CONFLICT(id)\n",
          "DO UPDATE SET\n",
          "\tjsonb=excluded.jsonb\n",
          "\t,deleted=excluded.deleted\n",
          "\t,rev=excluded.rev\n",
          "\t,mtime_ms=excluded.mtime_ms\n",
          hasContextColumn ? "\t,context=excluded.context\n" : "\n",
          "\tWHERE\n",
          `\t\trev = ?\n`,
        ].join("");
        const sqlString1 =
          sqlPart1 + (previousVersionOfDocument ? sqlPart2 : "");
        const sql1 = this.connection.prepare(sqlString1);
        const insertArgs = [
          getDocumentId(newVersionOfDocument),
          JSON.stringify(newVersionOfDocument),
          newVersionOfDocument._deleted ? 1 : 0,
          newVersionOfDocument._rev,
          Math.floor(newVersionOfDocument._meta.lwt),
        ];
        if (hasContextColumn) {
          insertArgs.push(newVersionOfDocument.context);
        }
        if (previousVersionOfDocument) {
          insertArgs.push(previousVersionOfDocument._rev);
        }
        try {
          const insertResult = sql1.run(insertArgs);
          if (insertResult.changes === 1) {
            success.push(newVersionOfDocument);
          } else {
            throw new Error(insertResult);
          }
        } catch (err: unknown) {
          if (isSqliteError(err)) {
            // If the id is duplicated, throw a conflict error.  This requires
            // getting the existing record from the database.
            if (
              err.code === "SQLITE_CONSTRAINT_PRIMARYKEY" &&
              err.message === "UNIQUE constraint failed: " + tableName + ".id"
            ) {
              const sqlString2 = [
                `SELECT json(jsonb) AS json FROM ${tableName}\n`,
                "WHERE id = ?",
              ].join("");
              const sql2 = this.connection.prepare(sqlString2);
              const result2 = sql2.get([getDocumentId(newVersionOfDocument)]);
              const documentInDb = JSON.parse(result2.json);
              const conflict = {
                status: 409, // conflict
                isError: true,
                documentId: getDocumentId(newVersionOfDocument),
                writeRow: currentWrite,
                documentInDb: documentInDb,
              };
              error.push(conflict);
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }
      return Promise.resolve({
        success,
        error,
      });
    } catch (err: unknown) {
      return Promise.reject(err);
    }
  }

  close(userKey: number): Promise<void> {
    const collectionName: string = this.userMap.get(userKey);
    if (collectionName) {
      this.userMap.delete(userKey);
      const stillInUse = !!Array.from(this.userMap.keys()).length;
      if (stillInUse) {
        return Promise.resolve();
      }
      this.connection.close();
      this.connection = undefined;
      return Promise.resolve();
    } else {
      return Promise.reject(`close() called with invalid userKey: ${userKey}`);
    }
  }

  init(
    filename: string,
    options: Partial<RxStoragePESQLiteImplOptions>,
    collectionName: string,
  ): Promise<number> {
    try {
      this.connect(filename, options);
      this.configureSQLite();
      this.initializeDatabase();
      const userKey = Date.now();
      this.userMap.set(userKey, collectionName);
      return Promise.resolve(userKey);
    } catch (err: unknown) {
      return Promise.reject(err);
    }
  }

  query<RxDocType>(
    collectionName: string,
    preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageQueryResult<RxDocType>> {
    try {
      this.throwIfNoConnection();

      const tableName = this.getTableNameWithCollectionName(collectionName);
      const queryBuilder = new RxStoragePESQLiteQueryBuilder(preparedQuery);
      const whereClause = queryBuilder.whereClause;
      const sql1 = this.connection.prepare(
        [
          "SELECT id, json(jsonb) AS json, deleted, rev, mtime_ms\n",
          `FROM ${tableName}\n`,
          whereClause,
        ].join(""),
      );
      const result1: Array<{json: string}> = sql1.all([]);
      const resultingDocuments = result1.map((value) => {
        return JSON.parse(value.json);
      });
      return Promise.resolve({
        documents: resultingDocuments,
      });
    } catch (err: unknown) {
      return Promise.reject(err);
    }
  }

  removeCollection(collectionName: string): Promise<void> {
    // Drop the collection_collectionName table.
    this.throwIfNoConnection();

    const tableName = this.getTableNameWithCollectionName(collectionName);
    try {
      const sql1 = this.connection.prepare(`DROP TABLE ${tableName};`);
      sql1.run([]);
      return Promise.resolve();
    } catch (err: unknown) {
      return Promise.reject(err);
    }
  }

  whichBackend(): string {
    return "better-sqlite3";
  }

  private connect(
    filename: string,
    options: Partial<RxStoragePESQLiteImplOptions>,
  ) {
    this.connection = openDatabase(filename, options);
  }

  private initializeDatabase(): void {
    if (!this.connection) {
      throw new Error("No database connection");
    }
    const userVersionResult: unknown = this.connection.pragma("user_version", {
      simple: true,
    });
    if (typeof userVersionResult === "number") {
      const userVersion: number = userVersionResult;
      console.log(`Current schema version: ${userVersion}`);
      if (userVersion < 1) {
        this.migration0001();
      }
    } else {
      throw new Error(
        `Pragma user_version returned a ${typeof userVersionResult}: ${userVersionResult}`,
      );
    }
  }

  private configureSQLite(): void {
    if (!this.connection) {
      throw new Error("No database connection");
    }
    this.connection.pragma("journal_mode = WAL");
  }

  private getTableNameWithCollectionName(collectionName: string): string {
    if (collectionName === "_rxdb_internal") {
      return collectionName;
    }
    // This comes from the RxDB RxCollection documentation.
    const collectionNameRegexp = /^[a-z][a-z0-9]*$/;
    if (collectionNameRegexp.exec(collectionName) === null) {
      throw new Error(
        `Collection name ${collectionName} does not match the desired pattern.`,
      );
    }
    return "collection_" + collectionName;
  }

  private migration0001(): void {
    if (!this.connection) {
      throw new Error("No database connection");
    }
    createDocumentTableAndIndexsWithTableName(
      this.connection,
      RXDB_INTERNAL_TABLE,
      true,
    );
    this.connection.pragma("user_version = 1");
  }

  private throwIfNoConnection(): void {
    if (!this.connection || !this.connection.open) {
      throw new Error("No database connection");
    }
  }
}

export function getPESQLiteImplBetterSQLite3(databaseOptions: DatabaseOptions) {
  return new RxStoragePESQLiteImplBetterSQLite3(databaseOptions);
}

function createDocumentTableAndIndexsWithTableName(
  connection: DatabaseInterface,
  tableName: string,
  addContextColumn?: boolean,
) {
  if (!connection || !connection.open) {
    throw new Error("No database connection");
  }
  const tableNameRegexp = /[a-zA-Z_]\w*/;
  if (
    tableNameRegexp.exec(tableName) === null &&
    tableName !== RXDB_INTERNAL_TABLE
  ) {
    throw new Error(
      `Table name ${tableName} does not match the desired pattern.`,
    );
  }

  try {
    const sql1 = connection.prepare(
      [
        "CREATE TABLE " + tableName + "(\n",
        "\tid TEXT PRIMARY KEY NOT NULL\n",
        "\t,jsonb BLOB NOT NULL\n",
        "\t,deleted INTEGER NOT NULL\n",
        "\t,rev TEXT NOT NULL\n",
        "\t,mtime_ms INTEGER NOT NULL\n",
        addContextColumn ? "\t,context TEXT NOT NULL\n" : "",
        ");",
      ].join(""),
    );
    // Will throw an exception if this fails.
    sql1.run();
  } catch (err: unknown) {
    if (isSqliteError(err)) {
      if (err.message !== "table " + tableName + " already exists") {
        throw err;
      }
    }
  }
  const sql2 = connection.prepare(
    [
      "CREATE INDEX idx_" + tableName + "_deleted_id\n",
      "\tON " + tableName + "(deleted, id);",
    ].join(""),
  );
  sql2.run();
  const sql3 = connection.prepare(
    [
      "CREATE INDEX idx_" + tableName + "_mtime_ms_id\n",
      "\tON " + tableName + "(mtime_ms, id);",
    ].join(""),
  );
  sql3.run();
  if (addContextColumn) {
    const sql4 = connection.prepare(
      [
        "CREATE INDEX idx_" + tableName + "_context\n",
        "\tON " + tableName + "(context);",
      ].join(""),
    );
    sql4.run();
  }
}
