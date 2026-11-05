# @ohos-ports-electron/node-machine-id

MIT port of node-machine-id 1.1.12 by Aleksandr Komlev. Recipe: https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/node-machine-id/1.1.12 . Original documentation: README.upstream.md.

```sh
npm install @ohos-ports-electron/node-machine-id@beta
```
```js
const {machineId, machineIdSync} = require('@ohos-ports-electron/node-machine-id');
const hashed = machineIdSync(); // SHA-256 hex
const original = await machineId(true);
```

ESM named imports are also supported. Public functions and types are retained. macOS, Windows, Linux and FreeBSD use the unchanged upstream bundle. Only `process.platform` values `ohos` and `openharmony` use the shell-free implementation. No runtime dependencies or install lifecycle scripts.

On HarmonyOS, readable /var/lib/dbus/machine-id or /etc/machine-id takes priority. Otherwise a cryptographically random 128-bit identifier is atomically published to the application's private `/data/storage/el2/base/files/.node-machine-id` (or a writable home directory outside a HAP) with mode 0600. Set `OHOS_MACHINE_ID_DIR` to an existing absolute writable directory to choose storage explicitly; all processes sharing an ID must use the same directory. A valid cache at the selected location is reused. This fallback identifies this application's installation/home, not a hardware device or all applications on the PC. It remains stable across processes and runtime upgrades while this directory survives; clearing app data or uninstalling can reset it. Different applications may have different IDs. A malformed/unwritable cache reports an error instead of silently returning a temporary ID. Consumers must not assume an immutable device identifier or use this value as a secret.

Use the API in Electron's main process or a Node/Worker context. With contextIsolation enabled, expose only the required result through restricted IPC. There are no ArkTS host bridge requirements. Tested runtime matrix and exact hashes are in the recipe release evidence: independent DevNode-OH plus Electron-OH 25/34/37/40. Validation demos use --jitless; the library does not require JIT/WASM. Full upstream platform coverage and a complete on-device npm CLI install are not claimed.
