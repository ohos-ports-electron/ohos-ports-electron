# @ohos-ports-electron/napi-rs-canvas

OpenHarmony arm64 port of napi-rs Canvas 1.0.2, with separate source-built native addons for standalone Node and Electron-OH. Package JavaScript and types start from the locked `@ohos-ports/napi-rs-canvas@1.0.2-beta.0` baseline; the Node native addon is rebuilt to fix the same Lottie recording defect as Electron.

```sh
npm install @ohos-ports-electron/napi-rs-canvas
```

```js
const { createCanvas } = require('@ohos-ports-electron/napi-rs-canvas')
const canvas = createCanvas(100, 100)
canvas.getContext('2d').fillRect(0, 0, 100, 100)
const png = canvas.toBuffer('image/png')
```

This package targets OpenHarmony arm64. It does not add desktop Linux, macOS, or Windows binaries. Preserve the original upstream API and types. See [upstream Canvas](https://github.com/Brooooooklyn/canvas) for API documentation.

## Electron-OH application integration

Use the framework belonging to the selected Electron-OH release. This package does not contain Electron, a HAP, or an SDK.

Copy `native/electron/skia.electron-oh-arm64.node` to the application's **code-signed native library directory**, retaining this basename. The loader checks `/data/storage/el1/bundle/libs/arm64/` and `arm64-v8a/`, then the packaged relative native directory. Apply native code signing, HAP signing and verification. A resource-only copy can be rejected by the framework's loader namespace.

Older Electron 25 Workers can omit `process.versions.electron`. Before requiring the package in such a Worker, set the existing `NAPI_RS_NATIVE_LIBRARY_PATH` override to the actual signed Electron addon path used by the main process. Do not overwrite `skia.openharmony-arm64.node`, which is the standalone Node binary.

The tested 37.2.0 and 40.0.0 framework inputs require project-local repair of their internal N-API relocations. The contribution recipe includes hash-guarded `bind-electron37-napi.py` and `bind-electron40-napi.py`; apply only to the specified input hashes, before rebuilding and signing your HAP. Installing this npm package does not modify a shared framework. Record and deploy the effective engine hash as part of the application.

Native Canvas runs in `--jitless` mode in this acceptance setup. Electron 25 requires the flag in the ArkTS/native startup arguments before `runBrowser`, because application JavaScript can run too late. This package does not establish JIT/WASM compatibility or replace permissions required by an application's other components.

## Native provenance and licenses

The Electron addon is built from upstream Canvas commit `826600b258db693d98a652c935e2b94107b41bb2`, matching Skia commit `634e970210b7f8233cec53510bf82a3c9c18a80d`, locked Cargo/Skia dependencies, and the source patches in the contribution recipe. It statically contains a project-maintained, typed C forwarding shim. It does not link the unavailable source of the historical official `libshim.a`, and needs no old bridge `.so`.

`native-source.json` records the source, patch, compiler and output hashes. `licenses/` contains collected dependency notices, including source/build dependencies; the collection is a superset and does not assert every listed component is linked into the addon. `LICENSE` retains the upstream Canvas license. The Node addon uses the same patched Canvas/Skia sources and resolves Node-API symbols from its Node host; it does not link the Electron forwarding shim.

The source and integration recipe is maintained in [ports/napi-rs-canvas/1.0.2](https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/napi-rs-canvas/1.0.2). Acceptance reports bind exact package and framework hashes. Support claims are limited to recorded device runs and their declared test scope; they do not imply exhaustive API or resource-pressure testing.
