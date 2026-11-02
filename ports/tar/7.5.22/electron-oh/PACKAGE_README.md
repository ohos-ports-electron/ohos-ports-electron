# @ohos-ports-electron/tar

OpenHarmony Node and Electron-OH distribution of node-tar 7.5.22
(BlueOak-1.0.0). The upstream JavaScript, ESM/CJS exports, types, source maps
and runtime dependencies are unchanged. Only distribution identity, repository
metadata and this README differ; README.upstream.md retains upstream guidance.

```sh
npm install @ohos-ports-electron/tar@electron-oh
```

```js
const tar = require('@ohos-ports-electron/tar')
await tar.c({ cwd: '/your/app/writable/data', file: '/your/app/writable/backup.tgz', gzip: true }, ['documents'])
await tar.x({ cwd: '/your/app/writable/restore', file: '/your/app/writable/backup.tgz' })
```

ESM: `import { c, x } from '@ohos-ports-electron/tar'`.
Use Electron main or a Node Worker, with a limited IPC interface to a renderer
and contextIsolation enabled. This package supplies no Node/Electron runtime.

## Platform conditions and verification scope

Use writable application sandbox paths. File ownership, symlinks and hard links
remain subject to native OS permissions. Link extraction can produce native
EACCES/EPERM warnings in restricted sandboxes; applications must inspect warnings.
The library does not emulate links, elevate privileges or disable path checks.

The verification project runs the same frozen tarball on independent
OpenHarmony Node and Electron-OH 25/34/37/40 with two cold starts per target.
Its representative assertions cover archive create/list/extract, streams,
gzip, append/update, filters, paths, Header/Pax, errors, ESM and Worker exit.
Exact engines, package hashes and results are recorded in release evidence.
This is not the complete upstream test suite or a security certification.
JIT/WASM, privileged ownership, Windows behavior, large archives and stress
loads are outside the suite. Test launchers use --jitless; tar has no JIT/WASM
requirement. A separately documented Node syscall fallback belongs to the
verification runtime and is not included in this npm package.

## Package contents

The package contains upstream dist/commonjs and dist/esm (JavaScript, declarations
and source maps), LICENSE.md, package.json, this README and README.upstream.md.
There are no native addons, HAPs, engines, SDKs, tests or signing materials.
Runtime dependencies remain @isaacs/fs-minipass, chownr, minipass, minizlib, yallist.
Normal host npm installation resolves these dependencies; complete device-side
npm CLI installation is not claimed.

Upstream: https://github.com/isaacs/node-tar
Recipe and release evidence:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/tar/7.5.22
