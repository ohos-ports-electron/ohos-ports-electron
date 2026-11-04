# @ohos-ports-electron/which

OpenHarmony Node / Electron-OH distribution of which 7.0.0 (ISC).
The JavaScript implementation is unchanged from upstream npm/node-which
(zero patches). This distribution changes the npm identity, repository
metadata and this README.

```sh
npm install @ohos-ports-electron/which@electron-oh
```

```js
const which = require('@ohos-ports-electron/which')

// find the first instance of an executable in the PATH
const node = which.sync('node')

// async form, all matches, and nothrow are supported
const allNodes = await which('node', { all: true })
const missing = await which('definitely-missing', { nothrow: true }) // null
```

The `node-which` command-line wrapper (`-a`, `-s`, `--`) behaves as
upstream. On OpenHarmony the POSIX executable check is used
(`process.platform` is `openharmony`); the Windows `PATHEXT` branch is
inert, matching other non-win32 hosts. Use the main process or a Node
runtime for file system work and expose results through a limited IPC API
to Electron renderers; keep contextIsolation enabled. This package does
not implement ArkTS APIs or supply a Node/Electron runtime.

## Platform conditions

The app-domain sandbox on OpenHarmony applies to the demo host runtime,
not to this package: the verification Node host LD_PRELOADs a syscall
fallback shim (io_uring/close_range to ENOSYS) and runs with
`--jitless` (which has no JIT/WASM requirement), while Electron-OH
processes run their embedded Node through the privileged runtime path.
`which` resolves executables with `fs.stat` mode bits and uid/gid
comparisons via `isexe`; no platform logic was changed.

The verification project targets independent OpenHarmony Node and
Electron-OH 34, 37 and 40 using one frozen npm tarball, real PATH-lookup
assertions (33-case upstream-derived roster on the Node target; the
11 CLI cases that re-exec the command through `process.execPath` run
only where a standalone Node runtime exists) and two cold starts per
target. Exact runtime hashes, installation scope, results and
limitations are recorded in the contribution's release evidence.

## Contents and provenance

The package contains the upstream JavaScript (`lib/index.js`,
`bin/which.js`), LICENSE, package.json, this README and
README.upstream.md. There are no native addons, lifecycle scripts,
Electron engines, HAPs, test projects or signing materials inside this
package.

Upstream documentation: README.upstream.md and
https://github.com/npm/node-which
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/which/7.0.0
