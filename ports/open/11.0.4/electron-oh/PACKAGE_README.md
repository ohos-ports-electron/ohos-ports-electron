# @ohos-ports-electron/open

Electron-OH / OpenHarmony port of [open 11.0.4](https://github.com/sindresorhus/open/tree/v11.0.4), MIT. Distribution recipe: [ohos-ports-electron](https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/open/11.0.4). Original documentation is in README.upstream.md.

```sh
npm install @ohos-ports-electron/open@beta
```
```js
import open, {openApp, apps} from '@ohos-ports-electron/open';
await open('https://example.com');
await openApp('com.example.app/EntryAbility');
```

## Host integration

Call the library from the Electron main process or a standalone DevNode-OH process. Import `harmony-host/OpenHostBridge.ets` by copying it into your HAP's ArkTS source; instantiate `new OpenHostBridge(this.context)` in UIAbility.onCreate, call start(), and call stop() in onDestroy. Set OPEN_HARMONY_BRIDGE_DIR to the same application's private files directory plus `/open-harmony-bridge` in Node. Electron without the bridge can use its real shell.openExternal/openPath for default URLs/files; named applications and cooperative results require the bridge. Keep contextIsolation enabled and expose only specific IPC actions to renderers.

The optional private HNP launcher gives bridge calls a real ChildProcess. Build it with `node harmony-host/build-launcher.mjs --ndk <OHOS_NATIVE_SDK> --out <open-launcher>`, package it under `pkg/bin/` in a private HNP, declare the HNP in module.json5, and sign code in the containing HAP. Set OPEN_HARMONY_LAUNCHER to its actual executable path in the application's HNP namespace. Its PID identifies the request launcher, not the opened application. Without it a successful bridge call returns undefined. This npm package ships the launcher source, not a pre-signed HNP or runtime. Use your own authorized application signing identity.

```js
let received;
await openApp('com.example.app/ResultAbility', {
  arguments: ['中文 空格', ''],
  harmony: {
    parameters: {documentId: '123'}, argumentsParameter: 'argv',
    waitForResult: true, resultTimeout: 30000,
    onResult(result) { received = result; }
  }
});
```

The target must understand these Want parameter names and return via terminateSelfWithResult. Result codes are business results, not POSIX exit codes. Timeout abandons waiting without terminating the target. Parameters are limited to 32 KiB, depth 16, strings, finite numbers, booleans, plain nested objects and nonempty homogeneous primitive arrays. Lossy values such as null, undefined, mixed/empty/object arrays, sparse arrays, accessors, negative zero and cycles are rejected before dispatch.

## Supported behavior and limits

URLs and local files use the real system opener; named apps use bundle[/AbilityName]. `apps.browser` uses the system default browser and `apps.huawei` names the Huawei browser. Desktop browser names and browserPrivate explicitly reject on HarmonyOS. Arbitrary Ability `wait:true` and unmapped CLI arguments explicitly reject. Cooperative `harmony.waitForResult` is a separate API. background/newInstance are accepted and ignored as on upstream non-macOS platforms. Absolute executable paths use actual spawn with exact argv, wait, exit codes, SIGTERM and application fallback. Existing macOS/Windows/Linux paths are retained.

Target matrix: standalone DevNode-OH and Electron-OH 25/34/37/40. Exact runtime hashes and device results are maintained in the recipe's release evidence. Electron-OH 25 embeds Node 18 with a newer Electron V8; upstream's engines.node >=20 remains, and generic standalone Node 18 support is not claimed. Demos use --jitless because this library does not require JIT or WASM. A host runtime's child-process fixes, when required, are documented separately and are not part of this npm package. Full upstream API/platform coverage, arbitrary installed apps, browser privacy protocol, and application-process-exit waits are outside the tested scope.
