# electron-is-dev 3.0.1 · Electron-OH recipe

Builds **@ohos-ports-electron/electron-is-dev@3.0.1-electron-oh.0** from the locked upstream
electron-is-dev 3.0.1 registry tarball. All distributed JavaScript files (`index.js`,
`index.d.ts`) are byte-identical to upstream; this port is zero-patch. Changes are npm
identity/repository metadata and the README; the original readme is preserved as
`README.upstream.md`. MIT license and original authors are retained. There are no runtime
dependencies (the only import is Electron's built-in module).

## npm distribution

Candidate SHA256: `14e1d80e683ae24b639bb43cb25efce257f0a5c9a2d6e62ae439db739ffa50ae`.
The package contains 6 files: `index.js`, `index.d.ts`, `license`, `package.json`,
`readme.md` (this port's package readme) and `README.upstream.md`. The exact paths and
SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

electron-is-dev is pure ESM with no runtime dependency (`import electron from 'electron'`
resolves to the host's built-in module). There are no engines, HAPs, SDKs, tests, signing
keys or lifecycle scripts in this npm package. Existing platform behavior and public APIs
are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to readme.md |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host-safe identity/hash/guard suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero-patch** (`patchs/` stays empty): package.json identity/repository
changes are applied by build.py directly from inputs.lock.json.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging,
manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not
publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/electron-is-dev-build
python3 electron-oh/tools/release.py bind --bundle /tmp/electron-is-dev-build
python3 electron-oh/tools/release.py verify --bundle /tmp/electron-is-dev-build
python3 electron-oh/tools/release.py host --bundle /tmp/electron-is-dev-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per
target on one HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive serial
window. The device roster is the same 10-case suite on every target (1 upstream tsd type
assertion executed with the real tsd 0.30.7 toolchain + 8 value cases over the env/isPackaged
logic + 1 non-Electron guard observed through a private-HNP independent-node vehicle),
driven by the real electron-is-dev module. Host CI replays the host-safe identity/hash/guard
subset; it does not claim fresh device execution and cannot load the electron-only library
under plain Node.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 10/10 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 10/10 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 10/10 |

`node` role is **electron-only not-applicable**: electron-is-dev is ESM with a top-level
`import electron from 'electron'` and throws `TypeError('Not running in an Electron
environment!')` outside Electron (verified as a device roster case through the independent
node vehicle), so the independent HarmonyOS Node cannot run the value semantics; recorded as
N/A rather than a fabricated pass, matching the existing electron-only ports in this
repository. `electron25` is not part of the default matrix and was not requested.

Demo conditions: `--jitless` (pure-JS library, no JIT/WASM requirement). Full HAP projects,
signing material and raw logs remain in the first-stage project
`E:\jsAdaptPublish\electron-is-dev-3.0.1`, not this port.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md),
[recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and
[dedicated workflow](../../../.github/workflows/electron-is-dev-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity.
The existing-version path verifies bytes and still verifies both `latest` and `beta` tags.
A different existing integrity or another tag target is rejected. Actual publication state
is determined by npm/CI receipts, not this preparation document.
