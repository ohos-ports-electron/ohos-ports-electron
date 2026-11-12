# @ohos-ports-electron/windows-registry

HarmonyOS PC (OpenHarmony arm64) ready distribution of
[`@vscode/windows-registry`](https://www.npmjs.com/package/@vscode/windows-registry) `1.3.0`.

This package is a repack of the upstream `@vscode/windows-registry@1.3.0` npm tarball.
The JavaScript distribution (`dist/index.js`, `dist/index.d.ts`, `dist/index.js.map`) is
byte-identical to upstream; only the package name, version, repository metadata and this
README differ. No source patches are involved.

## Behaviour on HarmonyOS

`@vscode/windows-registry` is a Windows-only native module. It compiles a `.node` addon
from `src/winregistry.cc` **only when `process.platform === 'win32'`** (`lib/index.ts`).
On every other platform — including OpenHarmony — the JS layer short-circuits the platform
guard and never loads the native addon. The exported functions keep the upstream
non-Windows contract:

```js
const registry = require('@ohos-ports-electron/windows-registry');

registry.GetStringRegKey('HKEY_LOCAL_MACHINE', 'SOFTWARE\\...', 'Name');
// throws: GetStringRegKey is only available on Windows.

registry.GetDWORDRegKey('HKEY_LOCAL_MACHINE', 'SOFTWARE\\...', 'Name');
// throws: GetDWORDRegKey is only available on Windows.
```

This is exactly how the upstream package behaves on Linux and macOS. Real Windows-registry
access is not available on HarmonyOS; the library contracts to fail fast with a clear
message and keep the process alive rather than crash.

## Install

```sh
npm install @ohos-ports-electron/windows-registry
```

No native build step is required on OpenHarmony (the addon is never loaded). The package
has no runtime dependencies.

## Compatibility

Verified on OpenHarmony-7.0.0.109 (aarch64) under the standalone DevNode-OH Node 24.13.0
runtime and Electron-OH 34.8.6 / 37.2.0 / 40.0.1. The package is plain CommonJS; the only
platform caveat is that the host app may run under `--jitless` (W^X) — this library does
not require JIT or WebAssembly.

Upstream project: <https://github.com/Microsoft/vscode-windows-registry>.
License: MIT (see `License.txt` and `SECURITY.md`).

Port maintained in the [ohos-ports-electron](https://github.com/ohos-ports-electron/ohos-ports-electron)
repository at `ports/windows-registry/1.3.0`.
