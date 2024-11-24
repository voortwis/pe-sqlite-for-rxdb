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
  InternalStoreCollectionDocType,
  InternalStoreDocType,
  PreparedQuery,
  RxDocumentData,
  RxJsonSchema,
  RxStorageQueryResult,
  RxStorageWriteError,
  RxStorageWriteErrorConflict,
  StringKeys,
} from "rxdb";
import type { RxStoragePESQLiteImpl } from "./storage-impl";
import type { BulkWriteResponse, DocumentIdGetter } from "./types";

import { default as path } from "node:path";
import {
  default as openDatabase,
  Database as DatabaseInterface,
} from "better-sqlite3";
import { defaultHashSha256 } from "rxdb";
import { RxStoragePESQLiteQueryBuilder } from "./query-sqlite3";

const RXDB_INTERNAL_TABLE = "_rxdb_internal";

function isInternalStoreDocType<DocType>(
  probableInternalStoreDoc: unknown,
): probableInternalStoreDoc is InternalStoreDocType<DocType> {
  const doc: InternalStoreDocType<DocType> =
    probableInternalStoreDoc as InternalStoreDocType<DocType>;
  return (
    typeof doc?.id === "string" &&
    typeof doc?.key === "string" &&
    typeof doc?.context === "string" &&
    typeof doc?.data === "object"
  );
}

function isInternalStoreCollectionDocType(
  probableInternalStoreCollectionDoc: unknown,
): probableInternalStoreCollectionDoc is InternalStoreCollectionDocType {
  const doc: InternalStoreCollectionDocType =
    probableInternalStoreCollectionDoc as InternalStoreCollectionDocType;
  return (
    isInternalStoreDocType(doc) &&
    typeof doc?.data?.name === "string" &&
    typeof doc?.data?.schema === "object" &&
    typeof doc?.data?.schemaHash === "string" &&
    typeof doc?.data?.version === "number" &&
    typeof doc?.data?.connectedStorages !== "undefined" &&
    Array.isArray(doc.data.connectedStorages) &&
    (typeof doc?.data?.migrationStatus === "undefined" ||
      typeof doc?.data?.migrationStatus === "object")
  );
}

type SingleInsertResult = Array<{ json: string }>;

function isSingleInsertResult(
  probably: unknown,
): probably is SingleInsertResult {
  return (
    Array.isArray(probably) &&
    probably.length === 1 &&
    typeof probably[0] === "object" &&
    typeof probably[0].json === "string"
  );
}

interface SqliteError extends Error {
  name: string;
  message: string;
  code: "SQLITE_ERROR" | "SQLITE_CONSTRAINT_PRIMARYKEY";
}

function isSqliteError(probableError: unknown): probableError is SqliteError {
  const err: SqliteError = probableError as SqliteError;
  return (
    typeof err.name === "string" &&
    typeof err.message === "string" &&
    (err.code === "SQLITE_ERROR" || err.code === "SQLITE_CONSTRAINT_PRIMARYKEY")
  );
}

export interface RxStoragePESQLiteImplBetterSQLite3Options {
  fileMustExist?: boolean;
  nativeBinding?: string;
  readonly?: boolean;
  timeout?: number;
  verbose?: (message: unknown, ...additionalArgs: unknown[]) => void;
}

export class RxStoragePESQLiteImplBetterSQLite3
  implements RxStoragePESQLiteImpl
{
  private _connection?: DatabaseInterface;
  // TODO:
  // In order to remove this <any>, we need to split Impl from Internals.
  // Internals will be specific to the document type and Impl will not.
  // Then, this map of query builders will be owned by the Internals class.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queryBuilders: Map<string, RxStoragePESQLiteQueryBuilder<any>> =
    new Map();
  private userMap: Map<number, string> = new Map();

  /**
   * If fileName is provided, the database file is opened immediately.
   * If not, the database file is opened when a database name is received (via
   * init()) from the RxStorageInstance.
   */
  constructor(
    public fileName?: string,
    private options?: RxStoragePESQLiteImplBetterSQLite3Options,
  ) {}

  async addCollections<RxDocType>(
    collectionName: string,
    getDocumentId: DocumentIdGetter<RxDocType>,
    bulkWrites: BulkWriteRow<RxDocType>[],
  ): Promise<BulkWriteResponse<RxDocType>> {
    try {
      const bulkWriteResult = await this.bulkWrite(
        collectionName,
        getDocumentId,
        bulkWrites,
      );
      if (bulkWriteResult.error.length == 1) {
        return Promise.resolve(bulkWriteResult);
      }
      const addCollectionTablesAndIndexes = this.connection().transaction(
        (collectionDocuments: BulkWriteRow<RxDocType>[]) => {
          for (let i = 0; i < collectionDocuments.length; i++) {
            const collectionDocument = collectionDocuments[i].document;
            if (isInternalStoreCollectionDocType(collectionDocument)) {
              const collectionTableName = this.tableNameWithCollectionName(
                collectionDocument.data.name,
              );
              createDocumentTableAndIndexesWithTableName(
                this.connection(),
                collectionTableName,
              );
            } else {
              console.error(
                "Collection document is not an InternalStoreCollectionDocType",
              );
              console.dir(collectionDocument, { depth: null });
              throw new Error(
                "Expected a collection document to be an InternalStoreCollectionDocType.",
              );
            }
          }
        },
      );
      addCollectionTablesAndIndexes(bulkWrites);
      return Promise.resolve(bulkWriteResult);
    } catch (err: unknown) {
      return Promise.reject(err);
    }
  }

  bulkWrite<RxDocType>(
    collectionName: string,
    getDocumentId: DocumentIdGetter<RxDocType>,
    bulkWrites: BulkWriteRow<RxDocType>[],
  ): Promise<BulkWriteResponse<RxDocType>> {
    try {
      const connection = this.connection();

      const error: RxStorageWriteError<RxDocType>[] = [];
      const success: Map<
        RxDocType[StringKeys<RxDocType>],
        RxDocumentData<RxDocType>
      > = new Map();
      const tableName = this.tableNameWithCollectionName(collectionName);

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
          ") VALUES (\n",
          "\t?, jsonb(?), ?, ?, ?\n",
          ")\n",
        ].join("");
        const sqlPart2 = [
          "ON CONFLICT(id)\n",
          "DO UPDATE SET\n",
          "\tjsonb=excluded.jsonb\n",
          "\t,deleted=excluded.deleted\n",
          "\t,rev=excluded.rev\n",
          "\t,mtime_ms=excluded.mtime_ms\n",
          "\tWHERE\n",
          `\t\trev = ?\n`,
        ].join("");
        const sqlPart3 = ["RETURNING json(jsonb) AS json\n"].join("");
        const sqlString1 =
          sqlPart1 + (previousVersionOfDocument ? sqlPart2 : "") + sqlPart3;
        const sql1 = connection.prepare(sqlString1);
        const documentId = getDocumentId(newVersionOfDocument);
        const insertArgs = [
          documentId,
          JSON.stringify(newVersionOfDocument),
          newVersionOfDocument._deleted ? 1 : 0,
          newVersionOfDocument._rev,
          Math.floor(newVersionOfDocument._meta.lwt),
        ];
        if (previousVersionOfDocument) {
          insertArgs.push(previousVersionOfDocument._rev);
        }
        try {
          const unknownInsertResult = sql1.all(insertArgs);
          if (unknownInsertResult.length !== 1) {
            throw new Error("Failed to insert document in SQLite database");
          }
          if (isSingleInsertResult(unknownInsertResult)) {
            const insertedDocument = JSON.parse(
              unknownInsertResult[0].json,
            ) as RxDocumentData<RxDocType>;
            success.set(documentId, insertedDocument);
          } else {
            console.error("unknownInsertResult is not an InsertResult");
            console.dir(unknownInsertResult, { depth: null });
            throw new Error("INSERT INTO database returned unknown type.");
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
              const sql2 = connection.prepare(sqlString2);
              const result2 = sql2.get([documentId]) as { json: string };
              const documentInDb = JSON.parse(result2.json);
              const conflict = {
                attachmentId: "",
                documentId: documentId,
                documentInDb: documentInDb,
                isError: true,
                status: 409, // conflict
                writeRow: currentWrite,
              } as RxStorageWriteErrorConflict<RxDocType>;
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
    const collectionName: string | undefined = this.userMap.get(userKey);
    if (collectionName) {
      this.userMap.delete(userKey);
      const stillInUse = !!Array.from(this.userMap.keys()).length;
      if (stillInUse) {
        return Promise.resolve();
      }
      if (this._connection) {
        this._connection.close();
        this._connection = undefined;
      }
      return Promise.resolve();
    } else {
      return Promise.reject(`close() called with invalid userKey: ${userKey}`);
    }
  }

  init(databaseName: string, collectionName: string): Promise<number> {
    try {
      this.connectWithDatabaseName(databaseName);
      this.configureSQLite();
      this.initializeDatabase();
      let userKey = Date.now();
      let possibleDuplicate = this.userMap.get(userKey);
      // Check for duplicates.  This happens in some of the quicker tests.
      while (
        possibleDuplicate !== undefined &&
        possibleDuplicate !== collectionName
      ) {
        userKey++;
        possibleDuplicate = this.userMap.get(userKey);
      }
      this.userMap.set(userKey, collectionName);
      return Promise.resolve(userKey);
    } catch (err: unknown) {
      return Promise.reject(err);
    }
  }

  async query<RxDocType>(
    collectionName: string,
    collectionSchema: RxJsonSchema<RxDocumentData<RxDocType>>,
    preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageQueryResult<RxDocType>> {
    const tableName = this.tableNameWithCollectionName(collectionName);
    const queryBuilder =
      await this.queryBuilderWithCollectionSchema(collectionSchema);
    const queryAndArgs =
      queryBuilder.queryAndArgsWithPreparedQuery(preparedQuery);
    const sql1 = this.connection().prepare(
      [
        "SELECT id, json(jsonb) AS json, deleted, rev, mtime_ms\n",
        `FROM ${tableName}\n`,
        queryAndArgs.query,
      ].join(""),
    );
    const result1 = sql1.all(queryAndArgs.args) as Array<{ json: string }>;
    const resultingDocuments = result1.map((value) => {
      return JSON.parse(value.json);
    });
    return { documents: resultingDocuments };
  }

  removeCollection(collectionName: string): Promise<void> {
    // Drop the collection_collectionName table.
    const tableName = this.tableNameWithCollectionName(collectionName);
    try {
      const sql1 = this.connection().prepare(`DROP TABLE ${tableName};`);
      sql1.run([]);
      return Promise.resolve();
    } catch (err: unknown) {
      return Promise.reject(err);
    }
  }

  whichBackend(): string {
    return "better-sqlite3";
  }

  private configureSQLite(): void {
    this.connection().pragma("journal_mode = WAL");
  }

  private connectWithDatabaseName(databaseName: string) {
    const fileName = this.fileNameWithDatabaseNameOrThrow(databaseName);
    this._connection = openDatabase(fileName, this.options);
  }

  private connection(): DatabaseInterface {
    if (!this._connection || !this._connection.open) {
      throw new Error("No database connection");
    }
    return this._connection;
  }

  /**
   * Return a filename which matches the databaseName if no filename has been
   * specified.  Throw an Error if the databaseName ( + '.sqlite3') does not
   * correspond to the provided filename.
   */
  private fileNameWithDatabaseNameOrThrow(databaseName: string): string {
    const result = databaseName + ".sqlite3";
    if (this.fileName === undefined) {
      this.fileName = result;
    } else {
      const baseName = path.basename(this.fileName, ".sqlite3");
      if (baseName !== databaseName) {
        const baseNamePlusExt = path.basename(this.fileName);
        throw new Error(
          `Database name ${databaseName} + .sqlite3 must match the filename ${baseNamePlusExt}`,
        );
      }
    }
    return result;
  }

  private initializeDatabase(): void {
    const userVersionResult: unknown = this.connection().pragma(
      "user_version",
      {
        simple: true,
      },
    );
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

  private migration0001(): void {
    createDocumentTableAndIndexesWithTableName(
      this.connection(),
      RXDB_INTERNAL_TABLE,
    );
    this.connection().pragma("user_version = 1");
  }

  /**
   * Because one RxStoragePESQLiteImpl can be used by multiple
   * RxStoragePESQLiteInstances and the RxStoragePESQLiteQueryBuilder is
   * specific to a RxJsonSchema<RxDocType> (a.k.a. a collection's schema), the
   * RxStoragePESQLiteImpl must handle multiple
   * RxStoragePESQLiteQueryBuilders.
   */
  private async queryBuilderWithCollectionSchema<RxDocType>(
    collectionSchema: RxJsonSchema<RxDocumentData<RxDocType>>,
  ): Promise<RxStoragePESQLiteQueryBuilder<RxDocType>> {
    const schemaHash = await defaultHashSha256(
      JSON.stringify(collectionSchema),
    );
    const preexistingQueryBuilder = this.queryBuilders.get(schemaHash);
    if (preexistingQueryBuilder !== undefined) {
      return preexistingQueryBuilder;
    }
    const newQueryBuilder = new RxStoragePESQLiteQueryBuilder(collectionSchema);
    this.queryBuilders.set(schemaHash, newQueryBuilder);
    return newQueryBuilder;
  }

  private tableNameWithCollectionName(collectionName: string): string {
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
}

export function getPESQLiteImplBetterSQLite3(
  fileName?: string,
  options?: RxStoragePESQLiteImplBetterSQLite3Options,
) {
  return new RxStoragePESQLiteImplBetterSQLite3(fileName, options);
}

function createDocumentTableAndIndexesWithTableName(
  connection: DatabaseInterface,
  tableName: string,
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
  try {
    const sql2 = connection.prepare(
      [
        "CREATE INDEX idx_" + tableName + "_deleted_id\n",
        "\tON " + tableName + "(deleted, id);",
      ].join(""),
    );
    sql2.run();
  } catch (err: unknown) {
    if (isSqliteError(err)) {
      if (
        err.message !==
        "index idx_" + tableName + "_deleted_id already exists"
      ) {
        throw err;
      }
    }
  }
  try {
    const sql3 = connection.prepare(
      [
        "CREATE INDEX idx_" + tableName + "_mtime_ms_id\n",
        "\tON " + tableName + "(mtime_ms, id);",
      ].join(""),
    );
    sql3.run();
  } catch (err: unknown) {
    if (isSqliteError(err)) {
      if (
        err.message !==
        "index idx_" + tableName + "_mtime_ms_id already exists"
      ) {
        throw err;
      }
    }
  }
}
