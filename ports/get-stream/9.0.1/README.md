# get-stream 9.0.1 · Electron-OH recipe

Builds **@ohos-ports-electron/get-stream@9.0.1-electron-oh.0** from the locked upstream get-stream 9.0.1 registry tarball.
The package is a pure ESM Node.js library (get a stream as a string, Buffer, ArrayBuffer or array). All distributed source files are byte-identical to upstream; this port is zero-patch. Changes are npm identity/repository metadata and the README; the original readme.md is preserved as README.upstream.md. The MIT LICENSE and the `exports` map (`source/index.js` default, `source/exports.js` browser, `source/index.d.ts` types) are retained unchanged, as is `"type": "module"`.

## npm distribution

The package contains 14 files; the exact paths and SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

- `README.md`
- `README.upstream.md`
- `license`
- `package.json`
- `source/` (10 files: array-buffer/array/buffer/contents/exports/index.js/index.d.ts/stream/string/utils)

get-stream has two pure-JS runtime dependencies (`@sec-ant/readable-stream ^0.4.1`, `is-stream ^4.0.1`) resolved by npm at install time; they are not vendored into the tarball. There are no engines, HAPs, SDKs, tests, signing keys, bin entries or lifecycle scripts in this npm package. Existing platform behavior and public APIs are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host get-stream suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero-patch** (`patchs/` stays empty): package.json identity/repository changes are applied by build.py directly from inputs.lock.json, mirroring the upstream metadata rewrite.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging, manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/get-stream-build
python3 electron-oh/tools/release.py bind --bundle /tmp/get-stream-build
python3 electron-oh/tools/release.py verify --bundle /tmp/get-stream-build
python3 electron-oh/tools/release.py host --bundle /tmp/get-stream-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target on one HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive serial window. The device roster is the unchanged upstream ava suite: 189 assertions across 10 test files under `source/test/`, each run in a worker isolate through the app-domain harness. The suite binds every run to the exact frozen package bytes (app-src/identity.json checks package name/version and all 10 distributed source file hashes) so a payload mismatch cannot silently pass.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 189/189 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 189/189 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 189/189 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 189/189 |

Platform conditions on OpenHarmony are recorded, not patched around: the independent Node host LD_PRELOADs a syscall fallback shim (io_uring/close_range to ENOSYS) supplied by the demo runtime, not by this package, and both host kinds run under `--jitless` (app-domain W^X; the library has no JIT/WASM requirement). Two test-side platform equivalents are applied by the demo harness (not the library): a WASM-free fetch equivalent for the `integration.js` fetch case (jitless disables WebAssembly, which undici needs for llhttp) whose guarded property has redundant coverage in `web-stream.js`, and an Electron-OH V8 TextDecoder over-length guard for the upstream `string.js` single-chunk string case. The upstream assertions themselves are unchanged.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md), [repository releasing guide](../../../docs/RELEASING.md), and [dedicated workflow](../../../.github/workflows/get-stream-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing version path verifies bytes and still verifies both latest and beta tags; a legacy electron-oh tag is only removed when it points at this validated candidate, and publication never recreates it. A different existing integrity or another tag target is rejected. Actual publication state is determined by npm/CI receipts, not this preparation document.
