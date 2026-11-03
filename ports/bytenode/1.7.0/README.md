# bytenode 1.7.0 · Electron-OH recipe

Builds **@ohos-ports-electron/bytenode@1.7.0-electron-oh.0** from the locked upstream bytenode 1.7.0 registry tarball.
All 3 distributed JavaScript files (lib/index.js, lib/cli.js, lib/index.d.ts) are byte-identical to upstream; this port is zero-patch. Changes are npm identity/repository metadata and the README; the original README is preserved as README.upstream.md. MIT LICENSE and original authors are retained.

## npm distribution

Candidate SHA256: `7a19ca522aa3f42c94de371985812f796aa7347feaed4308e1a067d236072c6b`.
The package contains 7 files: 3 `lib/` files, LICENSE, package.json, the package README and upstream README. The exact paths and SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

- `LICENSE`
- `README.md`
- `README.upstream.md`
- `lib/cli.js`
- `lib/index.d.ts`
- `lib/index.js`
- `package.json`

bytenode has zero runtime dependencies and no native bindings. There are no engines, HAPs, SDKs, tests, signing keys or lifecycle scripts in this npm package. Existing platform behavior and public APIs are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host bytecode suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero-patch** (`patchs/` stays empty): package.json identity/repository changes are applied by build.py directly from inputs.lock.json, mirroring the upstream metadata rewrite.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging, manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/bytenode-build
python3 electron-oh/tools/release.py bind --bundle /tmp/bytenode-build
python3 electron-oh/tools/release.py verify --bundle /tmp/bytenode-build
python3 electron-oh/tools/release.py host --bundle /tmp/bytenode-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target. The device roster is 26 cases (24 upstream mocha it() blocks consolidated + 2 backfilled gaps) on Electron targets and 14 node-applicable cases on the independent Node target, driven by the real bytenode API and CLI. Host CI separately replays the host-safe subset of the same assertions; it does not claim fresh device execution.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 14/14 |
| electron25 | 25.3.2 | 18.15.0 | 2 × 26/26 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 26/26 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 26/26 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 26/26 |

V8 bytecode is runtime-build specific; every compile/run round-trip executes inside the same target runtime. On OpenHarmony there is no spawnable desktop Electron binary in the app domain, so `compileElectronCode`/`compileFile({electron: true})` integrations verify through a same-bundle private Node HNP executable path passed via `electronPath` (real spawn, real child bytecode compilation); the `electronMain`/`electronRenderer` process forms cannot produce their success-path artifacts on this platform and the suite verifies their error contracts (clean rejection with the child exit code and stderr details) instead. This is a platform form-factor limitation recorded as such, not a fake pass. Demo conditions: `--jitless` and the unavailable legacy code-memory ACL omitted. The full upstream historical mocha suite requires a desktop Electron binary and was not rerun on device for the Electron-specific spawn family beyond the equivalent construction above.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md), [repository releasing guide](../../../docs/RELEASING.md), and [dedicated workflow](../../../.github/workflows/bytenode-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing version path verifies bytes and still verifies both latest and electron-oh tags. A different existing integrity or another tag target is rejected. Actual publication state is determined by npm/CI receipts, not this preparation document.
