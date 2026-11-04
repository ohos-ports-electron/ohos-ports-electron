# @ohos-ports-electron/axios

OpenHarmony distribution of Axios 1.21.0 (MIT), preserving upstream JavaScript,
public CJS/ESM API, types, dependencies and license. Original documentation is
README.upstream.md. Only distribution metadata and this README differ.

```sh
npm install @ohos-ports-electron/axios@electron-oh
```

```js
const axios = require('@ohos-ports-electron/axios');
const response = await axios.get('https://example.com/api', {adapter: 'http'});
```

Use the Node HTTP adapter in Electron main/Node processes; expose narrow IPC to
isolated renderers. A renderer may use the upstream browser build subject to
Chromium CORS and sandbox rules. Runtime engines, HAPs, SDK, signing files and
test harness helpers are not included in this npm package.

The five-target representative device suite exercises real loopback HTTP/HTTPS,
redirects, compression, requests/responses, multipart/streaming, cancellation,
timeouts, errors, interceptors, configuration, CJS/ESM and Worker exit. It is not
the complete upstream test roster. Device launchers use --jitless. Axios HTTP
does not require JIT/WASM; native Undici Fetch dispatch requires WASM on these
engines. Fetch adapter tests explicitly supply a WASM-free Node HTTP/HTTPS Fetch
bridge from the reference harness, with pinned test-only dependencies. Native
Fetch/WASM, external-network connectivity and renderer XHR are outside coverage.
Production dependencies are normally installed/locked on the host; a complete
device-side npm CLI installation is not claimed. Exact versions, conditions and
source hashes are recorded by the recipe and device reports.

Upstream: https://github.com/axios/axios
Recipe: https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/axios/1.21.0
