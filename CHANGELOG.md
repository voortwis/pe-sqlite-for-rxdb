# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unrelased

### Added

- Implement the "$ne" query operation
- Implement the "$nin" query operation

## [0.1.6]

### Fixed

- Support RxCollections with hyphens or capital letters in the collection name
- Check for collection names which would result in table names being too long

## [0.1.5]

### Changed

- Used type information with esLint

### Fixed

- Paths passed to RxStoragePESQLiteImplBetterSQLite3 are no longer ignored

## [0.1.4]

### Added

- Expose the current version via the `version` attribute
- Implemented the "$lt" and "$lte" query operations
- Export the 'storage-impl-better-sqlite3' module

### Changed

- Change the `mtime_ms` column from `INTEGER` to `REAL`. This change is not
  handled automatically and will break existing databases.

## [0.1.3]

### Added

- Implemented the "$gt" and "$gte" query operations
- Add parentheses for complex logical operations

### Fixed

- Updated `ws` dependency due to DoS vulnerability
- Return an array of successfully written documents from `bulkWrite`

## [0.1.2]

### Added

- Implemented a checkpoint type
- Implemented the "$in" query operation
- Implemented `findDocumentsById`

### Fixed

- `bulkWrite` now emits RxChangeEvents

### Removed

- Removed the unused @vitest/ui dependency
- Removed the broken non-implementation of `getChangedDocumentsSince`

## [0.1.1]

### Changed

- `better-sqlite3` imports moved from static to dynamic
- `better-sqlite3` moved from optionalDepedencies to peerDependencies
- Dependencies updated

### Fixed

- `addCollections()` supports adding multiple collections
- Fixed map key collection with userKeys

## [0.1.0]

### Added

- Added ESLint for linting
- Added lint-staged for processing staged files
- Added Husky for pre-commit scripts
- Added Prettier for formatting
- Added TypeScript for minimal type-safety
- Added Vite for compiling
- Added Vitest for testing
- Added enough code so that `createRxDatabase()` succeeds
- Added "PE" prefix to prevent confusion: SQLite -> PESQLite
- Added enough code so that `addCollections()` does not error
- Added enough working code so that collections are removable.
- Added enough code so that some queries work
- Added enough types that the TypeScript compiler is happy
- Added handing for ORs in queries
- Added handling for ORDER BY in queries

[0.1.6]: https://github.com/pineapple-electric/pe-sqlite-for-rxdb/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/pineapple-electric/pe-sqlite-for-rxdb/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/pineapple-electric/pe-sqlite-for-rxdb/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/pineapple-electric/pe-sqlite-for-rxdb/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/pineapple-electric/pe-sqlite-for-rxdb/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/pineapple-electric/pe-sqlite-for-rxdb/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/pineapple-electric/pe-sqlite-for-rxdb/releases/tag/v0.1.0
