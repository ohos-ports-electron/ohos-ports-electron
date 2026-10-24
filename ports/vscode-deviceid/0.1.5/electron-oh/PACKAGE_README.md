# vscode-deviceid for Electron-OH

Install: `npm install @ohos-ports-electron/vscode-deviceid@electron-oh`.

```js
const {getDeviceId} = require('@ohos-ports-electron/vscode-deviceid');
async function main() {
  console.log(await getDeviceId());
}
main().catch(console.error);
```

Based on `@ohos-ports/vscode-deviceid@0.1.5-beta.0` (upstream 0.1.5).
Adds the `ohos` platform alias used by Electron-OH, retaining `openharmony` and all existing platform branches.
Harmony uses pure JavaScript and needs neither a native addon nor libshim.a.
The Windows registry helper remains source-compatible; installation invokes node-gyp only on Windows.

Call the package in the Electron main process. Expose a narrow asynchronous IPC API to an isolated renderer;
do not enable renderer nodeIntegration. Set HOME to an application-owned writable directory if the runtime
does not provide one. XDG_CACHE_HOME optionally selects the cache root; otherwise HOME/.cache is used.
The library appends Microsoft/DeveloperTools/deviceid. Configure a stable location before the first call.

The result is a persisted generated UUID, not a hardware UDID. Existing IDs, empty files and UTF-8 BOM
handling follow the original implementation. MIT license and upstream notices are retained.

Recipe, inputs, demos and validation: https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/vscode-deviceid/0.1.5
Runtime dependency versions used for verification are recorded in the demo dependency lock and reports.
Windows is retained but was not device-tested in this Harmony validation.
