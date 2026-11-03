# @ohos-ports-electron/bytenode

OpenHarmony Node / Electron-OH distribution of bytenode 1.7.0 (MIT).
The JavaScript implementation is unchanged from upstream (zero patches).
This distribution changes the npm identity, repository metadata and this README.

```sh
npm install @ohos-ports-electron/bytenode@electron-oh
```

```js
const bytenode = require('@ohos-ports-electron/bytenode')
const bytecode = bytenode.compileCode('module.exports = 42')
// run bytecode produced by the same V8/Node build
const value = bytenode.runBytecode(bytecode)
```

The CLI is also available: `npx @ohos-ports-electron/bytenode --compile app.js`.
Use the Electron main process or the Node runtime for compilation and loading;
expose results through a limited IPC API to the renderer. Keep
contextIsolation enabled. This package does not implement ArkTS APIs or supply
a Node/Electron runtime.

## Platform conditions

V8 bytecode is not portable across V8 builds: `.jsc` files must be produced
and loaded by the same runtime line (same Node/Electron version). On
OpenHarmony there is no spawnable desktop Electron binary in the app domain,
so `compileElectronCode`/`compileFile({electron: true})` integrations verify
through a same-bundle private Node HNP executable path passed via
`electronPath`; the `electronMain`/`electronRenderer` process forms cannot
produce their success-path artifacts on this platform and their error
contracts (clean rejection with the child exit code and stderr details) are
what the suite verifies. This package neither fakes those processes nor
changes OS policy.

The verification project targets independent OpenHarmony Node and Electron-OH
25, 34, 37 and 40 using one frozen npm tarball, real bytecode compile/run/CLI
assertions and two cold starts per target. Exact runtime hashes, installation
scope, results and limitations are recorded in the contribution's release
evidence. The test applications run with `--jitless`; bytenode itself has no
JIT/WASM requirement (it drives the V8 cache-data API).

## Contents and provenance

The package contains the upstream `lib/` JavaScript (index.js, cli.js,
index.d.ts), LICENSE, package.json, this README and README.upstream.md. There
are no native addons, lifecycle scripts, runtime dependencies, Electron
engines, HAPs, test projects or signing materials inside this package.

Upstream documentation: README.upstream.md and
https://github.com/bytenode/bytenode/tree/v1.7.0
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/bytenode/1.7.0
