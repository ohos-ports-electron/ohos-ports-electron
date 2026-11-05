# better-sqlite3-multiple-ciphers 13.0.4-beta.0 · Electron-OH recipe

Builds **@ohos-ports-electron/better-sqlite3-multiple-ciphers@13.0.4-beta.0-electron-oh.0**
from the locked upstream registry tarball `better-sqlite3-multiple-ciphers@13.0.4-beta.0`
(SHA256 `0ad755e2…`). This is a native Node-API addon (SQLite3MultipleCiphers,
sqleet/sqlcipher/other-cipher encryption). The candidate = baseline tarball + lib/
patches (loader/static-entry adaptation) + `prebuilds/openharmony-arm64.node`
(device-ABI addon) + npm metadata rewrite.

## npm distribution

The package contains 73 files; exact paths and SHA256 are in
[package-inventory.json](electron-oh/package-inventory.json). The runtime JS
(`lib/**`), C++ sources (`src/**`), SQLite amalgamation (`deps/**`), types and
per-platform prebuilds are retained; the only functional changes versus upstream
are:

- `lib/binding.js`: `BETTER_SQLITE3_NATIVE_BINDING` env override (Electron hosts
  load the Electron-ABI addon from HAP libs) and `openharmony` added to
  `PREBUILD_PLATFORMS` so the standalone OHOS Node default loader finds
  `prebuilds/openharmony-arm64.node`.
- `lib/{openharmony,ohos}-{arm64,x64}.js`: static entry points mirroring the
  upstream `linux-*` entries. Electron-OH 34/37/40 main processes report
  `process.platform` as `openharmony` (37) or `ohos` (40), so both families are
  provided.
- `package.json`: `exports` gains the `./openharmony-*` and `./ohos-*` subpaths;
  name/version/repository/description rewritten to the ohos-ports identity.

The Electron-ABI addon is host-supplied at runtime (demo `nativeFiles` → HAP
libs) and never enters this npm package. There are no lifecycle scripts; npm
install resolves only `node-addon-api@^8.0.0`.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| patchs/ | Source-tree adaptation patch (see below) | No |
| electron-oh/inputs.lock.json | Baseline/candidate hashes, repository identity, runtime locks | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |
| electron-oh/tools/build.py | Reproducible candidate build from the locked baseline | No |
| electron-oh/tools/release.py | Frozen artifact, recipe/evidence and publication checks | No |
| electron-oh/tests/ | Host contract checks | No |
| electron-oh/release-evidence.json | Compact device records linked to the checked evidence archive | No |

## Device verification

One HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64). Baselines (original
npm package) fail on all four targets because the unmodified package has no
openharmony prebuild and its loader does not recognize the OHOS platform — the
honest reason this port exists. The frozen candidate passes the full 351-case
upstream roster twice per target on the standalone OHOS Node 24.13.0 and
Electron-OH 37.2.0 / 40.0.1. **Electron-OH 34 is blocked**: it bundles Node
20.18.1 (N-API 9), and upstream `src/util/constants.cpp` requires N-API 10 to
hold persistent references to strings; the Electron main thread SIGSEGVs at
first business load (see `reports/candidate/electron34/report.json` in the
single-library project and `release-evidence.json`). Host CI replays the
host-safe subset and does not claim fresh device execution.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md),
[recipe details](electron-oh/README.md), [repository releasing guide](../../../docs/RELEASING.md)
and the dedicated workflow. Publication is disabled by default; the workflow
permits only main push in `ohos-ports-electron/ohos-ports-electron` with
`npm-publish` and verifies `latest` + `beta` dist-tags.
