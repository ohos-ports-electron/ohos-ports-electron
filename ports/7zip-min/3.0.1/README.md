# 7zip-min 3.0.1 · Electron-OH recipe

Builds **@ohos-ports-electron/7zip-min@3.0.1-electron-oh.0** from the locked upstream 7zip-min 3.0.1 registry tarball.
7zip-min is a small promise/callback wrapper around a 7za subprocess (`pack`, `unpack`, `unpackSome`,
`list`, `cmd`, `config`, `getConfig`); the distributed JavaScript (`src/index.js`, `src/index.mjs`,
`src/index.d.ts`, `src/index.d.mts`) and LICENSE are byte-identical to upstream — this port is
**zero source patches**. Changes are npm identity/repository metadata, the bundled 7za supply and the
README; the original upstream README is preserved as `README.upstream.md`.

## Why a port is needed

Upstream `7zip-min` depends on `7zip-bin@5.1.1`, whose `linux/arm64/7za` is a glibc ELF that cannot
execute on the OpenHarmony musl runtime. This port resolves the `7zip-bin` dependency to the published
`@ohos-ports-electron/7zip-bin@5.2.0-electron-oh.0` port (npm alias) and vendors that package as
`node_modules/7zip-bin` inside the tarball (`bundledDependencies: ["7zip-bin"]`). The vendored
`openharmony/arm64/7za` is the static, self-contained OHOS build (sha256 `a3316c3d…ef0`, also shipped by
the 7zip-bin port), so `require('7zip-bin').path7za` resolves to an executable binary on OpenHarmony
(`process.platform` `openharmony` or `ohos`) while the other-platform binaries remain intact for the host
CI regression (`linux/x64/7za`, `win/x64/7za.exe`, …).

## npm distribution

The package contains 26 files; the exact paths and SHA256 values are in
[package-inventory.json](electron-oh/package-inventory.json).

- `src/index.js`, `src/index.mjs`, `src/index.d.ts`, `src/index.d.mts` (byte-identical to upstream)
- `LICENSE`, `package.json` (identity/repository/dependency rewrite), `README.md`, `README.upstream.md`
- `node_modules/7zip-bin/**` (vendored @ohos-ports-electron/7zip-bin 5.2.0-electron-oh.0, incl. the
  static `openharmony/arm64/7za`)

There are no lifecycle scripts, Electron engines, HAPs, SDKs, test projects or signing keys in this npm
package. Public APIs and other-platform behavior are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline, supply and candidate hashes; repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, supply vendoring, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host 7zip-min suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero-patch** (`patchs/` stays empty): package.json identity/repository/dependency changes are
applied by build.py directly from inputs.lock.json. The build output `bundle/` contains candidate.tgz,
original baseline.tgz, staging, manifest and CI recipe/commit binding files. Only **candidate.tgz** is
published. Do not publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/7zip-min-build
python3 electron-oh/tools/release.py bind --bundle /tmp/7zip-min-build
python3 electron-oh/tools/release.py verify --bundle /tmp/7zip-min-build
python3 electron-oh/tools/release.py host --bundle /tmp/7zip-min-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target on one
HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive serial window. The device roster is
the unchanged 30-case suite (pack/unpack/unpackSome/list/cmd/config API surface, error contracts and
dual-module identity); the electron-only asar binary-path-rewrite case runs on the three Electron targets.
Each run is bound to the exact frozen package bytes (`app-src/identity.json`: package name/version and the
four distributed source file hashes).

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 29/29 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 30/30 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 30/30 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 30/30 |

Platform conditions on OpenHarmony are recorded, not patched around: the app-domain SELinux allows exec
only for private HNP bin/ direct children, so the demo wires `config({binaryPath})` to the HNP-supplied
7za (same `a3316c3d…ef0` artifact) while the suite still asserts the library-contract `path7za`. The
independent Node host LD_PRELOADs a syscall fallback shim (io_uring/close_range to ENOSYS) and both host
kinds run under `--jitless` (app-domain W^X; the library has no JIT/WASM requirement).

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and
[dedicated workflow](../../../.github/workflows/7zip-min-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing
version path verifies bytes and still verifies both latest and beta tags; a legacy electron-oh tag is only
removed when it points at this validated candidate, and publication never recreates it. Actual publication
state is determined by npm/CI receipts, not this preparation document.
