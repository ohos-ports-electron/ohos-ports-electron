# vue 3.5.45 · Electron-OH recipe

Builds **@ohos-ports-electron/vue@3.5.45-electron-oh.0** from the locked upstream
vue 3.5.45 registry tarball. All distributed JavaScript files (`index.js`,
`dist/`, `compiler-sfc/`, `server-renderer/`, `jsx-runtime/`, type declarations)
are byte-identical to upstream; this port is zero-patch. Changes are npm
identity/repository metadata and the README; the original readme is preserved
as `README.upstream.md`. MIT license and original authors are retained. The
five runtime dependencies (`@vue/shared`, `@vue/runtime-dom`, `@vue/compiler-dom`,
`@vue/compiler-sfc`, `@vue/server-renderer`, all exactly `3.5.45`) keep resolving
through npm at install time.

## npm distribution

Candidate SHA256: recorded in [inputs.lock.json](electron-oh/inputs.lock.json) and
re-verified against device evidence. The package re-ships the 37 upstream files
plus `README.upstream.md`; the exact paths and SHA256 values are in
[package-inventory.json](electron-oh/package-inventory.json).

vue is pure JavaScript. There are no engines, HAPs, SDKs, tests, signing keys or
lifecycle scripts in this npm package. Existing platform behavior and public APIs
are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host vue suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero-patch** (`patchs/` stays empty): package.json identity/repository
changes are applied by build.py directly from inputs.lock.json.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging,
manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not
publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/vue-build
python3 electron-oh/tools/release.py bind --bundle /tmp/vue-build
python3 electron-oh/tools/release.py verify --bundle /tmp/vue-build
python3 electron-oh/tools/release.py host --bundle /tmp/vue-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts
per target on one HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive
serial window. The device roster is the 77-case upstream-derived suite split by host:
63 device-node cases (reactivity, runtime-core renderer/patch/scheduler semantics on a
custom host renderer, compiler-core/compiler-dom/compiler-sfc/compiler-ssr contracts,
server-renderer output; SFC cases needing TypeScript ship the compiler with the demo
application only) and 14 electron-oh renderer cases (real Chromium/ArkWeb DOM
assertions: createApp mount, nodeOps, patch\*, v-model/v-on/v-show, css modules/vars,
customElement), driven by the real vue API of the frozen tarball. Host CI separately
replays the host-safe subset of the same assertions; it does not claim fresh device
execution.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 63/63 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 14/14 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 14/14 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 14/14 |

The independent Node host runs `--jitless` (vue is pure JS with no JIT/WASM
requirement) and LD_PRELOADs a syscall fallback shim (io_uring/close_range to
ENOSYS) supplied by the demo runtime, not by this package. The electron-oh
renderer loads the shipped `dist/vue.esm-browser.js` ESM build directly in the
renderer; contextIsolation stays enabled and results cross the preload bridge.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and [dedicated workflow](../../../.github/workflows/vue-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity.
The existing version path verifies bytes and still verifies both latest and beta
tags. A different existing integrity or another tag target is rejected. Actual publication
state is determined by npm/CI receipts, not this preparation document.
