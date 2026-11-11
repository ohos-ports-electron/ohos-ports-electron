# urllib 4.9.0 · Electron-OH recipe

Builds **@ohos-ports-electron/urllib@4.9.0-electron-oh.0** from the locked upstream urllib 4.9.0 registry tarball.
urllib is a pure JavaScript HTTP client library (basic and digest auth, redirects, timeouts, gzip/brotli,
multipart, streaming, MockAgent and diagnostics channels) built on undici. The distributed JavaScript, types,
license and public API are unchanged from upstream; this port changes npm identity/repository metadata, the
dependency resolution for the HTTP/1 parser and the README.

## Why a port is needed

Published urllib@4.9.0 declares `undici ^7.1.1`, which resolves to undici 7.30.2. On OpenHarmony PC the app
domain runs under `--jitless` (W^X), which disables WebAssembly; undici's HTTP/1 response parsing (llhttp) is
WASM-based and would otherwise fail. This port vendors the exact resolved undici@7.30.2 with a pure-JS
HTTP/1 parser (`JsParser`) injected, shipped as a bundled dependency (`node_modules/undici`,
`bundledDependencies: ["undici"]`). When WebAssembly is available the upstream llhttp path is kept unchanged;
when unavailable the injected parser handles the response. All other dependencies (form-data, formstream,
mime-types, qs, type-fest, ylru) are unchanged pure-JS packages resolved normally by npm.

## npm distribution

The package contains 288 files; the exact paths and SHA256 values are in
[package-inventory.json](electron-oh/package-inventory.json).

- Root files: `dist/` (esm + commonjs), `src/`, `LICENSE`, `package.json`, `README.md`, `README.upstream.md`
- `node_modules/undici/` (undici 7.30.2 with the JsParser HTTP/1 parser injection, bundled dependency)

There are no lifecycle scripts, Electron engines, HAPs, SDKs, test projects or signing keys in this npm
package. Public APIs and other-platform behavior are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| patchs/ | Empty (zero source patches to urllib; undici parser injection is a dependency-layer supply applied by build.py via tools/apply-undici-js-parser.cjs) | No |
| electron-oh/inputs.lock.json | Baseline, undici supply and candidate hashes; repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, undici supply vendoring + JsParser injection, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/apply-undici-js-parser.cjs | Idempotent undici 7.30.2 JsParser injection | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host urllib suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

The build output `bundle/` contains candidate.tgz, original baseline.tgz, supply.tgz, staging, manifest and CI
recipe/commit binding files. Only **candidate.tgz** is published. Do not publish the containing bundle or
re-pack during publication.

```sh
# Python >=3.12 and Node >=18 required (build.py shells out to node for the undici parser injection).
bash build.sh --output /tmp/urllib-build \
  --supply-archive /tmp/undici-7.30.2.tgz \
  --parser-script "$PORT/electron-oh/tools/apply-undici-js-parser.cjs"
python3 electron-oh/tools/release.py bind --bundle /tmp/urllib-build
python3 electron-oh/tools/release.py verify --bundle /tmp/urllib-build
python3 electron-oh/tools/release.py host --bundle /tmp/urllib-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target on one
HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive serial window. The device roster is a
77-case suite derived from the upstream urllib@4.9.0 test tree (the master-line additions Cookie utilities and
followRedirect.crossOrigin are excluded because they are not in 4.9.0; HttpClient HTTP/2 is asserted with the
explicit `allowH2:true` semantics of 4.9.0). Each run binds to the exact frozen package bytes.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 77/77 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 77/77 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 77/77 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 77/77 |

Platform conditions on OpenHarmony are recorded, not patched around: the independent Node host LD_PRELOADs a
syscall fallback shim (io_uring/close_range to ENOSYS) supplied by the demo runtime, and both host kinds run
under `--jitless` (app-domain W^X). urllib itself is pure JS with no JIT/WASM requirement; the WASM gap is in
undici's llhttp parser and is bridged by the vendored JsParser supply.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and
[dedicated workflow](../../../.github/workflows/urllib-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing
version path verifies bytes and still verifies both latest and beta tags; a legacy electron-oh tag is only
removed when it points at this validated candidate, and publication never recreates it. Actual publication
state is determined by npm/CI receipts, not this preparation document.
