# @ohos-ports-electron/typeorm

OpenHarmony Node / Electron-OH distribution of typeorm 1.1.2 (MIT).
The JavaScript implementation is unchanged from upstream (zero patches).
This distribution changes the npm identity, repository metadata and this README
(upstream readme preserved as README.upstream.md).

```sh
npm install @ohos-ports-electron/typeorm@beta
```

```js
const { DataSource } = require('@ohos-ports-electron/typeorm');
```

The full public API of typeorm 1.1.2 is retained: `DataSource`, entity
decorators, `EntityManager` / `Repository` APIs (find methods, find options,
aggregates, criteria update/delete, soft delete), the query builder (select,
brackets, joins, insert/update/delete, soft-delete restore), transactions with
isolation levels, migrations (generate/show/create commands and the `typeorm`
CLI), entity subscribers and query events, tree tables (closure tables),
eager and cascading relations, indices, naming strategies and the query result
cache. Runtime dependencies (`@sqltools/formatter`, `ansis`, `dayjs`, `debug`,
`dedent`, `reflect-metadata`, `sql-highlight`, `tinyglobby`, `tslib`, `yargs`)
stay at their upstream ranges and resolve through npm at install time; they
are not vendored into this tarball.

Database drivers keep the upstream optional `peerDependencies` contract and
lazy loading via `PlatformTools.load`, so only installed drivers are touched:

- **better-sqlite3** — verified on device with the OpenHarmony arm64 build of
  better-sqlite3 13.0.3 (device-node and Electron-OH napi-shim ABI products
  from the `@ohos-ports/better-sqlite3` line; satisfy the upstream
  `^12.0.0` peer contract on the used API surface).
- **sql.js** — the default WASM entry is unavailable in the OpenHarmony app
  domain that runs `--jitless` (no WebAssembly); the verified equivalent path
  injects the official same-repo asm.js build (`dist/sql-asm.js`) through the
  documented `SqljsDriver` `driver` option / require-cache redirection. The
  driver itself in this package is unchanged.
- **ioredis** — verified in its degraded mode (unreachable endpoint with
  `ignoreErrors`, no auto-reconnect; queries fall through to the database).
- Oracle and SAP HANA data sources need closed-source native drivers without
  OpenHarmony builds and are out of scope; not installing them does not affect
  the other drivers (upstream lazy loading).
- Network drivers (mysql2, pg, mongodb, mssql, redis) keep upstream code
  paths and require a reachable server; the device roster exercises the
  local-only drivers (better-sqlite3, sql.js) plus the ioredis cache
  degradation path.

## Platform conditions

The device verification project targets independent OpenHarmony Node and
Electron-OH 34, 37 and 40 using one frozen npm tarball. The roster is the
41-case upstream-derived suite (44 upstream mocha test files aggregated to
roster ids, covering data source, entity metadata, indices, decorators,
repository methods, query builders, transactions with sqlite isolation,
sql.js startup/auto-save/save/load, better-sqlite3 WAL/busy-timeout/
close-error, eager and cascading relations, tree tables, migration commands,
entity subscribers, db cache and the abstract logger contract, plus one
generated DefaultNamingStrategy case) and one package identity case binding
the installed tarball name and version, each with two cold starts per
target. The device-node target runs `--jitless`; the SQL engines used on
device (better-sqlite3 native build and sql.js asm.js) are pure native/JS
code without JIT or WebAssembly requirements. The device app domain mounts
the suite read-only, so the demo supplies the documented platform
adjustments: sql.js asm.js redirection, the sql.js fixture staging, and an
fs-walking equivalent expansion for `tinyglobby` glob calls that return
empty on read-only absolute paths. These are demo-side conditions, not
patches to this package; upstream test assertions are unmodified.

On the device, `process.platform` reports `'openharmony'`; typeorm has no
platform-specific branch for the exercised paths, so the roster runs the same
platform-independent code as upstream CI. The exact runtime hashes,
installation scope, results and limitations are recorded in the
contribution's release evidence.

## Contents and provenance

The package contains the upstream distribution: compiled CommonJS modules and
declarations at the package root, the `browser/` build, `commands/`, driver
modules, `index.js` / `index.mjs` / `index.d.ts`, the CLI entry points
(`cli.js`, `cli-ts-node-*.js`), source maps, LICENSE, package.json, this README
and README.upstream.md. There are no native addons, lifecycle scripts,
Electron engines, HAPs, test projects or signing materials inside this
package.

Upstream documentation: README.upstream.md and https://github.com/typeorm/typeorm
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/typeorm/1.1.2
