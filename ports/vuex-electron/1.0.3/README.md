# vuex-electron 1.0.3 · Electron-OH recipe

Builds **@ohos-ports-electron/vuex-electron@1.0.3-electron-oh.0** from the locked upstream vuex-electron 1.0.3
registry tarball. All 19 non-`package.json` distributed files are byte-identical to upstream; the only change is
npm identity/repository metadata (name/version/repository/description/bugs + `files` allowlist that keeps the
full baseline file set including yarn.lock). MIT LICENSE and original authors are retained. Zero functional patches.

## npm distribution

Candidate SHA256: `6619f297b376851ed00027b19b6ecffcd94c82de485187b18233eb312228d5e6`.
The package contains 20 files: `dist/*.js` (3), `src/*.js` (3), `tests/*` (4), package.json, README.md, LICENSE,
CHANGELOG.md, yarn.lock and four dot-config files. The exact paths and SHA256 values are in
[package-inventory.json](electron-oh/package-inventory.json).

- `LICENSE`
- `README.md` (upstream README, byte-identical)
- `CHANGELOG.md`
- `yarn.lock`
- `.babelrc`, `.eslintignore`, `.eslintrc`, `.prettierrc`, `.travis.yml`
- `dist/index.js`, `dist/persisted-state.js`, `dist/shared-mutations.js`
- `src/index.js`, `src/persisted-state.js`, `src/shared-mutations.js`
- `tests/helpers.js`, `tests/index.test.js`, `tests/persisted-state.test.js`, `tests/shared-mutations.test.js`
- `package.json`

Runtime dependencies remain `deepmerge` and `electron-store`. They are resolved by normal npm install; the device
demo locks their exact host-resolved versions separately in the first-stage project. There are no native bindings,
Windows binaries, engines, HAPs, SDKs, tests-in-package, signing keys or install lifecycle scripts in this npm
package. Existing platform behavior and public APIs are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| patchs/ | Empty — zero functional patches (patch baseline is the npm tgz) | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline, candidate, repository and dist-tag hashes | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation (recipe-only reference) | No |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host identity/hash suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging, manifest and CI recipe/commit
binding files. Only **candidate.tgz** is published. Do not publish the containing bundle or re-pack during
publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/vuex-electron-build
python3 electron-oh/tools/release.py bind --bundle /tmp/vuex-electron-build
python3 electron-oh/tools/release.py verify --bundle /tmp/vuex-electron-build
python3 electron-oh/tools/release.py host --bundle /tmp/vuex-electron-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target, 26 assertions
per start (22 upstream equivalence-transcribed + 4 real BrowserWindow/ipcMain/ipcRenderer bridge cases). Host CI
replays the identity/hash contract; it does not claim fresh device execution and cannot load the electron-only
library under plain Node.

| Target | Reported Electron | Node | Candidate cold starts |
| --- | --- | --- | --- |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 26/26 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 26/26 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 26/26 |

`node` role is **electron-only not-applicable**: vuex-electron requires `require('electron')`/`electron-store` at
module load, so the independent HarmonyOS Node cannot load it; recorded as N/A rather than a fabricated pass.
`electron25` is explicitly excluded by the caller (no official Electron-OH v25 release).

Demo conditions: `--jitless` (pure-JS library, no JIT/WASM requirement). Full HAP projects, signing material and
raw logs remain in the first-stage project `E:\jsAdaptPublish\vuex-electron-1.0.3`, not this port.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and
[dedicated workflow](../../../.github/workflows/vuex-electron-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing-version
path verifies bytes and still verifies both `latest` and `electron-oh` tags via OIDC dist-tag writes. A different
existing integrity or another tag target is rejected. Actual publication state is determined by npm/CI receipts,
not this preparation document.
