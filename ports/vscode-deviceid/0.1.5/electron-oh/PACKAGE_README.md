# vscode-deviceid for Electron-OH

Recipe version: `@ohos-ports-electron/vscode-deviceid@0.1.5-electron-oh.1`.
During local validation install the generated tarball: `npm install /path/to/candidate.tgz`.
Registry installation of this revision is available only after a separate publication step; `.0` lacks the Node 20 UUID fix.

```js
const {getDeviceId} = require('@ohos-ports-electron/vscode-deviceid');
async function main() {
  console.log(await getDeviceId());
}
main().catch(console.error);
```

Based on `@ohos-ports/vscode-deviceid@0.1.5-beta.0` (upstream 0.1.5).
Accepts `ohos` (Electron-OH 34.5.4) and `openharmony` (Electron-OH 37.2.0 and standalone Node 24.13.0), retaining all existing platform branches.
Uses native dynamic `import("uuid")` inside the existing async ID-generation path so Node 20.18.1 can load the ESM dependency. The public Promise API, dependency declarations and storage behavior are unchanged.
Do not transpile this native dynamic import back to CommonJS `require()`.
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
