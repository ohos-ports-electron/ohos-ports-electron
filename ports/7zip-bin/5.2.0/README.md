# 7zip-bin 5.2.0 · Electron-OH recipe

Builds **@ohos-ports-electron/7zip-bin@5.2.0-electron-oh.0** from the locked baseline
`@ohos-ports/7zip-bin@5.2.0-beta.0` (upstream 7zip-bin 5.2.0 by develar) registry tarball.
7zip-bin is a precompiled-binaries path resolver: `index.js` resolves `path7za`/`path7x`
from `process.platform` / `process.arch` and ships per-platform 7za binaries. The baseline
already carries the `openharmony` platform branch and `openharmony/arm64/7za`.

## npm distribution

Candidate SHA256: `f9106dc4073295557350828e77cb25dc60fb78207ef6c0986c4d51f8fa53bd06`.
The package contains 18 files: `index.js`, `index.d.ts`, `7x.sh`, `package.json`,
`README.md` (this port's package readme), `LICENSE.txt` and the platform binaries
(`linux/`, `mac/`, `win/`, `openharmony/`). The exact paths and SHA256 values are in
[package-inventory.json](electron-oh/package-inventory.json).

No runtime dependencies, no lifecycle scripts, no engines, HAPs, SDKs or signing keys
in this npm package. Executable payloads (`7za`, `7za.exe`, `7x.sh`) keep the exec bit.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| patchs/0001-add-ohos-platform-branch.patch | Routes `process.platform === 'ohos'` (Electron-OH 40) to the openharmony payload | Applied to index.js (yes) |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, patch hash, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, patch application, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host 7zip-bin suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

`patchs/0001-add-ohos-platform-branch.patch` is the only functional change: Electron-OH 40
reports `process.platform === "ohos"` (34/37 report `"openharmony"`), so the baseline's
`openharmony` branch did not match on e40 and `path7za` fell through to the linux branch.
The patch extends the branch to `"openharmony" || "ohos"`. Everything else is npm
identity/repository metadata plus the package readme.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging,
manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not
publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/7zip-bin-build
python3 electron-oh/tools/release.py bind --bundle /tmp/7zip-bin-build
python3 electron-oh/tools/release.py verify --bundle /tmp/7zip-bin-build
python3 electron-oh/tools/release.py host --bundle /tmp/7zip-bin-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts
per target on one HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive
serial window. The device roster is the same 5-case suite on every target (path7za
resolution plus real 7za version / create-archive / extract-roundtrip / list). Host CI
separately replays the host-safe subset of the same assertions (package identity,
unchanged-lib hashes, path7za resolution and real archive operations via the linux/x64/7za
payload on the CI linux platform); it does not claim fresh device execution.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 5/5 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 5/5 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 5/5 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 5/5 |

On OpenHarmony the device Node reports `process.platform === 'openharmony'`; Electron-OH 40
reports `'ohos'` — both route to `openharmony/arm64/7za` (patch 0001). The app-domain
SELinux policy allows `exec` only for private HNP `bin/` direct children, so the demo
executes the same `openharmony/arm64/7za` payload (sha256 `a3316c3d…ef0`) from an
exec-permitted supply position (device-node `OHPT_7ZA_BIN`, electron-oh `ohpt-7za.hnp`)
while `F-01-01` still asserts the library-contract `path7za`. OH-Electron's main process
blocks synchronous exec (`execFileSync`/`spawnSync`), so the suite uses asynchronous
`spawn`. Demos run with `--jitless`; 7zip-bin is a pure binary-path library with no
JIT/WASM requirement.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and [dedicated workflow](../../../.github/workflows/7zip-bin-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity.
The existing version path verifies bytes and still verifies both latest and beta
tags. A different existing integrity or another tag target is rejected. Actual publication
state is determined by npm/CI receipts, not this preparation document.
