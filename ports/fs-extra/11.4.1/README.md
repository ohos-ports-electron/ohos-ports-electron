# fs-extra 11.4.1 · Electron-OH recipe

Builds **@ohos-ports-electron/fs-extra@11.4.1-electron-oh.0** from the locked upstream fs-extra 11.4.1 registry tarball.
All 29 distributed JavaScript files are byte-identical to upstream. Changes are npm identity/repository metadata and the README; the original README is preserved as README.upstream.md. MIT LICENSE and original authors are retained.

## npm distribution

Candidate SHA256: `47a53909b3b17c8ac092b6314c02a144a876750e9c2f80bc2f8c357ae304abcf`.
The package contains 33 files: 29 `lib/` JavaScript files, LICENSE, package.json, the package README and upstream README. The exact paths and SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

- `LICENSE`
- `README.md`
- `README.upstream.md`
- `lib/copy/copy-sync.js`
- `lib/copy/copy.js`
- `lib/copy/index.js`
- `lib/empty/index.js`
- `lib/ensure/file.js`
- `lib/ensure/index.js`
- `lib/ensure/link.js`
- `lib/ensure/symlink-paths.js`
- `lib/ensure/symlink-type.js`
- `lib/ensure/symlink.js`
- `lib/esm.mjs`
- `lib/fs/index.js`
- `lib/index.js`
- `lib/json/index.js`
- `lib/json/jsonfile.js`
- `lib/json/output-json-sync.js`
- `lib/json/output-json.js`
- `lib/mkdirs/index.js`
- `lib/mkdirs/make-dir.js`
- `lib/mkdirs/utils.js`
- `lib/move/index.js`
- `lib/move/move-sync.js`
- `lib/move/move.js`
- `lib/output-file/index.js`
- `lib/path-exists/index.js`
- `lib/remove/index.js`
- `lib/util/async.js`
- `lib/util/stat.js`
- `lib/util/utimes.js`
- `package.json`

Runtime dependencies remain graceful-fs, jsonfile and universalify. They are resolved by normal npm install; the device demo locks their exact host-resolved versions separately. There are no native bindings, Windows binaries, engines, HAPs, SDKs, tests, signing keys or lifecycle scripts in this npm package. Existing platform behavior and public APIs are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| patchs/0001-electron-oh-distribution-metadata.patch | Change package.json identity and repository | Applied content only |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline, patch, README and candidate hashes | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, patch replay and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host filesystem suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging, manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 and patch are required. Use a new output directory per attempt.
bash build.sh --output /tmp/fs-extra-build
python3 electron-oh/tools/release.py bind --bundle /tmp/fs-extra-build
python3 electron-oh/tools/release.py verify --bundle /tmp/fs-extra-build
python3 electron-oh/tools/release.py host --bundle /tmp/fs-extra-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target, 37 assertions per start. The suite covers real filesystem operations, sync/Promise/callback entry points, ESM, error propagation, content hashes and cleanup. Host CI separately replays the same representative suite; it does not claim fresh device execution.

| Target | Reported Electron | Node | Candidate cold starts |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 37/37 |
| electron25 | 25.3.2 | 18.15.0 | 2 × 37/37 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 37/37 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 37/37 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 37/37 |

Use writable sandbox paths. Link creation capability is measured against native fs; denied native errors must be retained rather than silently passed. The report gives separate link/symlink capability results. Link creation is not promised when the OS denies it. Preserved timestamps use a <=1 ms tolerance. The full upstream historical 445/767-case roster was not rerun in this contribution.

Demo conditions: --jitless (fs-extra has no JIT/WASM requirement); 25 receives that flag before V8 initialization and omits the unavailable legacy code-memory ACL. 34/40 compile using an isolated API declaration overlay from locked official OpenHarmony SDK interface files atop the installed API22 toolchain; runtime is the actual API26 device. The overlay changes declarations, not engine bytes, and does not validate printing/notification/power APIs. Vendor main.js entry and the 40 native executable helper deployment are preserved. Runtime/helper provenance and full HAP projects remain in the external verification project, not this port or npm tarball.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md), [repository releasing guide](../../../docs/RELEASING.md), and [dedicated workflow](../../../.github/workflows/fs-extra-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing version path verifies bytes and still verifies both latest and electron-oh tags. A different existing integrity or another tag target is rejected. Actual publication state is determined by npm/CI receipts, not this preparation document.
