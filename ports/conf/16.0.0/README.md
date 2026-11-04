# conf 16.0.0 · Electron-OH recipe

Builds `@ohos-ports-electron/conf@16.0.0-electron-oh.0` from the exact upstream
registry package `conf@16.0.0`. MIT license and original author are retained.
All four distributed `dist/source` files (JavaScript and declarations) are
byte-identical to upstream. Only distribution metadata and documentation change.
The upstream Node >=22 engine requirement is retained.

Candidate SHA256: `b26897ab7783b04871731cec3c2d7f8a0430676f724f400d866db07966e7ce84`.

## Distribution and recipe

The exact 8-file npm inventory and hashes are recorded in
[electron-oh/package-inventory.json](electron-oh/package-inventory.json).

| npm path | Source and purpose |
| --- | --- |
| dist/source/index.js | Unchanged upstream ESM implementation |
| dist/source/index.d.ts | Unchanged public API types |
| dist/source/types.js | Unchanged emitted types module |
| dist/source/types.d.ts | Unchanged option and supporting types |
| license | Original MIT license |
| package.json | Upstream API/dependencies with scoped name, version, repository and publish metadata |
| readme.md | Package use and platform scope from PACKAGE_README.md |
| README.upstream.md | Preserved original upstream readme.md |

Runtime dependencies remain ajv, ajv-formats, atomically, debounce-fn, dot-prop,
env-paths, json-schema-typed, semver and uint8array-extras. The exact transitive
closure used by tests is locked in `electron-oh/tests/package-lock.json`.
That testing lock is not an installation lock shipped to consumers. Upstream
build/test/prepare scripts are retained in metadata; there are no preinstall,
install or postinstall scripts. Frozen tarball publication uses --ignore-scripts.

| Recipe path | Purpose and package relationship |
| --- | --- |
| README.md | This recipe guide; not in npm |
| patchs/0001-*.patch | Distribution metadata change; applied to package.json |
| build.sh | Independent build entry; not in npm |
| publish.sh | Disabled by default; verifies or publishes the exact build tgz |
| electron-oh/inputs.lock.json | Baseline URL/integrity, patch hashes and candidate identity |
| electron-oh/PACKAGE_README.md | Copied to upstream readme.md; original retained separately |
| electron-oh/package-inventory.json | Exact npm file hashes; not in npm |
| electron-oh/tools/ | Deterministic build, evidence and release checks; not in npm |
| electron-oh/tests/ | Shared assertions, Worker, host lock and publication guard tests; not in npm |
| electron-oh/release-evidence.json | Bound five-target device summary and evidence archive; not in npm |
| electron-oh/README.md | Maintenance and platform conditions; not in npm |

The build output directory is an artifact containing staging, source baseline,
manifest and candidate.tgz. Only candidate.tgz is published. There are no addons,
Windows binaries, runtimes, HAPs, SDKs, demos or signing materials in the npm tgz.
The full local verification projects are retained outside this repository.

## Build and verification

```sh
bash build.sh --output /absolute/new-output-directory
python3 electron-oh/tools/release.py bind --bundle /absolute/new-output-directory
python3 electron-oh/tools/release.py verify --bundle /absolute/new-output-directory
python3 electron-oh/tools/release.py host --bundle /absolute/new-output-directory
```

Shared assertions exercise real disk persistence/reopen, nested keys, defaults,
schemas/formats, rejected writes, invalid JSON, custom serialization, CBC/GCM,
migrations, change callbacks/unsubscribe, external file watching, watcher cleanup,
Worker operations/exit and package byte identity. They do not run the entire
upstream test suite, privileged/symlink operations, Windows or stress workloads.
Host CI retains all five recorded Node roles. For the 18.15.0 role it runs the
complete suite under upstream host Electron 25.3.2 with ELECTRON_RUN_AS_NODE=1,
because standard Node 18 uses an older V8 without Array.toSorted while
Electron-OH 25 has that feature. This is a separate host regression, not a fresh
HarmonyOS device execution or a claim of standalone Node 18 compatibility. See the exact results in release evidence.

Runtime conditions: --jitless is used; conf needs no JIT/WASM. Electron 25 sets
this before V8 startup and omits unavailable code-memory ACLs. Vendor frameworks
and engine bytes are preserved. 34/40 use an isolated official API declaration
overlay with the installed compiler, and 40 deploys the vendor executable helper
into its expected native path. Independent Node retains the exact engine and a
separately documented MIT syscall fallback. These are demo/runtime conditions
and are not included in this npm distribution. Use a writable sandbox cwd.

## Release

See [package instructions](electron-oh/PACKAGE_README.md),
[maintenance notes](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md) and
[dedicated workflow](../../../.github/workflows/conf-electron-oh.yml).

Only trusted main push publication in npm-publish is enabled. The candidate is
built once; all checks and publication use the same tgz. Existing equal bytes
are verified and tags still checked; unequal bytes, registry auth errors and
unexpected newer tag targets are refused. Production requires both latest and
beta. Actual publication and website status are established by receipts,
not inferred from a successful local build.
