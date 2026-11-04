# electron-context-menu 5.1.0 · Electron-OH recipe

Builds **@ohos-ports-electron/electron-context-menu@5.1.0-electron-oh.0** from the locked upstream
electron-context-menu 5.1.0 registry tarball. All 4 non-`package.json` distributed files are byte-identical
to upstream; the only change is npm identity/repository metadata (name/version/repository/description/bugs;
`files` allowlist kept exactly as baseline so the full 5-file set stays: index.js, index.d.ts, license,
package.json, readme.md). MIT LICENSE and original authors are retained. Zero functional patches.

## npm distribution

Candidate SHA256: `b0d8adfb29c8f22d077b26036b028936a1ae3713e70f91e1e235b36837183a5e`.
The package contains 5 files: `index.js`, `index.d.ts`, `license`, `package.json`, `readme.md`.
The exact paths and SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

- `index.js` (ESM, byte-identical to upstream)
- `index.d.ts`
- `license`
- `readme.md` (upstream README, byte-identical)
- `package.json`

Runtime dependencies remain `cli-truncate`, `electron-dl`, `electron-is-dev`. They are resolved by normal
npm install; the device demo bundles their exact host-resolved closure separately in the first-stage project.
There are no native bindings, Windows binaries, engines, HAPs, SDKs, tests-in-package, signing keys or
install lifecycle scripts in this npm package. Existing platform behavior and public APIs are retained.

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
bash build.sh --output /tmp/electron-context-menu-build
python3 electron-oh/tools/release.py bind --bundle /tmp/electron-context-menu-build
python3 electron-oh/tools/release.py verify --bundle /tmp/electron-context-menu-build
python3 electron-oh/tools/release.py host --bundle /tmp/electron-context-menu-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target, 44
assertions per start (40 upstream test.js cases equivalence-transcribed + 4 generated cases). Host CI
replays the identity/hash contract; it does not claim fresh device execution and cannot load the
electron-only library under plain Node.

| Target | Reported Electron | Node | Candidate cold starts |
| --- | --- | --- | --- |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 44/44 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 44/44 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 44/44 |

`node` role is **electron-only not-applicable**: electron-context-menu is pure ESM with a top-level
`import 'electron'`, so the independent HarmonyOS Node cannot load it; recorded as N/A rather than a
fabricated pass. `electron25` is not part of the default matrix and was not requested.

Demo conditions: `--jitless` (pure-JS library, no JIT/WASM requirement). Full HAP projects, signing material
and raw logs remain in the first-stage project `E:\jsAdaptPublish\electron-context-menu-5.1.0`, not this port.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and
[dedicated workflow](../../../.github/workflows/electron-context-menu-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing-version
path verifies bytes and still verifies both `latest` and `electron-oh` tags via OIDC dist-tag writes. A different
existing integrity or another tag target is rejected. Actual publication state is determined by npm/CI receipts,
not this preparation document.
