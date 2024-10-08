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
  RxStorage,
  RxStorageInstance,
  RxStorageInstanceCreationParams,
} from "rxdb";
import type { RxStoragePESQLiteInstanceCreationOptions } from "./storage-instance-options";
import type { RxStoragePESQLiteInternals } from "./storage-internals";
import type { RxStoragePESQLiteOptions } from "./storage-options";

import { RXDB_VERSION } from "rxdb";
import { createRxStoragePESQLiteInstance } from "./storage-instance";
import { getRxStoragePESQLiteOptionsWithPartial } from "./storage-options";

export const RxStorageName = "Pineapple Electric SQLite RxStorage for RxDB";

export class RxStoragePESQLite
  implements
    RxStorage<
      RxStoragePESQLiteInternals,
      RxStoragePESQLiteInstanceCreationOptions
    >
{
  public readonly name = RxStorageName;
  public readonly rxdbVersion = RXDB_VERSION;
  constructor(public readonly options: RxStoragePESQLiteOptions) {}

  createStorageInstance<RxDocType>(
    params: RxStorageInstanceCreationParams<
      RxDocType,
      RxStoragePESQLiteInstanceCreationOptions
    >,
  ): Promise<
    RxStorageInstance<
      RxDocType,
      RxStoragePESQLiteInternals,
      RxStoragePESQLiteInstanceCreationOptions
    >
  > {
    return createRxStoragePESQLiteInstance(params, this.options);
  }

  async whichBackend(): Promise<string> {
    const internals = await this.options.sqliteInternals;
    return internals.whichBackend();
  }
}

export function getRxStoragePESQLite(
  options: Partial<RxStoragePESQLiteOptions> = {},
): RxStoragePESQLite {
  const allOptions = getRxStoragePESQLiteOptionsWithPartial(options);
  return new RxStoragePESQLite(allOptions);
}
