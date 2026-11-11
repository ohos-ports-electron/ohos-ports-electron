# @ohos-ports-electron/urllib

OpenHarmony Node / Electron-OH distribution of urllib 4.9.0 (MIT).
The JavaScript implementation is unchanged from upstream `urllib@4.9.0`
(zero source patches). This distribution changes the npm identity, repository
metadata, the dependency resolution for the HTTP/1 parser and this README.

```sh
npm install @ohos-ports-electron/urllib
```

```js
import { request, HttpClient } from '@ohos-ports-electron/urllib';

const { data, status } = await request('https://example.com/', { dataType: 'text' });
const client = new HttpClient({ allowH2: true });
```

`urllib` is an HTTP client library built on top of `undici` (basic and digest
authentication, redirects, timeouts, gzip/brotli, multipart upload, streaming,
MockAgent testing and diagnostics channels). It supports both ESM `import`
and CommonJS `require` entry points and full TypeScript definitions, exactly
as upstream.

## undici HTTP/1 parser supply

Upstream `urllib@4.9.0` depends on `undici ^7.1.1`. On OpenHarmony PC the
app domain runs under `--jitless` (W^X), which disables WebAssembly; undici's
HTTP/1 response parsing is WASM-based (llhttp) and would otherwise fail. This
port vendors the exact resolved `undici@7.30.2` with a pure-JS HTTP/1 parser
(`JsParser`) injected, shipped as a bundled dependency (`node_modules/undici`)
inside the tarball. When WebAssembly is unavailable the injected parser
handles the response; when WASM is available the upstream llhttp path is kept
unchanged. All other dependencies (`form-data`, `formstream`, `mime-types`,
`qs`, `type-fest`, `ylru`) are unchanged pure-JS packages resolved normally.

The upstream README is preserved as `README.upstream.md`.

## Platform conditions

OpenHarmony app-domain sandbox restrictions apply to the demo host runtime,
not to this package. The verification hosts run under `--jitless` (app-domain
W^X constraint) and the independent Node host LD_PRELOADs a syscall fallback
shim (io_uring/close_range to ENOSYS) supplied by the demo runtime, not by
this package. No urllib source was changed; the undici parser replacement is
the only functional dependency-layer change and it keeps the WASM-available
behavior identical (host `--jitless` roster: 76/77, the single non-pass
`socketPath` is a Windows-host unix-socket limitation and passes on device).

The verification project targets independent OpenHarmony Node and
Electron-OH 34, 37 and 40 using one frozen npm tarball, the 77-case device
roster derived from upstream urllib@4.9.0 tests and two cold starts per
target. Exact runtime hashes, installation scope, results and limitations are
recorded in the contribution's release evidence.

## Contents and provenance

The package contains the upstream `dist/` (esm + commonjs), `src/`, `LICENSE`,
`package.json`, this README, `README.upstream.md` and the bundled
`node_modules/undici` (undici 7.30.2 with the JsParser HTTP/1 parser supply).
There are no lifecycle scripts, Electron engines, HAPs, test projects or
signing materials inside this package.

Upstream documentation: README.upstream.md and https://github.com/node-modules/urllib
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/urllib/4.9.0
