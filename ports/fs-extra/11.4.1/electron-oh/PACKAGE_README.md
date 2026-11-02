# @ohos-ports-electron/fs-extra

OpenHarmony Node / Electron-OH distribution of fs-extra 11.4.1 (MIT).
The JavaScript implementation and dependencies are unchanged from upstream.
This distribution changes the npm identity, repository metadata and this README.

```sh
npm install @ohos-ports-electron/fs-extra@electron-oh
```

```js
const fs = require('@ohos-ports-electron/fs-extra')
await fs.outputJson('/your/app/writable/data/settings.json', { ready: true })
```

ESM: `import fs from '@ohos-ports-electron/fs-extra/esm'`.
Use the Electron main process or a Node Worker and expose a limited IPC API to
the renderer. Keep contextIsolation enabled. This package does not implement
ArkTS filesystem APIs or supply a Node/Electron runtime.

## Platform conditions

Applications must use writable sandbox paths. Symlink/hard-link creation can be
denied by the OS sandbox; ensureLink/ensureSymlink and link-preserving copy then
propagate the native filesystem error. This package neither emulates links nor
changes OS policy. Link creation support is not claimed for those sandboxes.
File timestamp precision depends on the filesystem. Tests of preserved
timestamps allow at most 1 ms difference.

The verification project targets independent OpenHarmony Node and Electron-OH
25, 34, 37 and 40 using one frozen npm tarball, real filesystem assertions and
two cold starts per target. Exact runtime hashes, installation scope, results
and limitations are recorded in the contribution's release evidence. JIT/WASM,
Windows behavior, privileged paths, cross-device mounts and stress testing are
outside this representative suite. The test applications may use --jitless;
fs-extra itself has no JIT/WASM requirement.

## Contents and provenance

The package contains the upstream lib/ JavaScript, LICENSE, package.json, this
README and README.upstream.md. There are no native addons, lifecycle scripts,
Electron engines, HAPs, test projects or signing materials inside this package.
Runtime dependencies remain graceful-fs, jsonfile and universalify.

Upstream documentation: README.upstream.md and
https://github.com/jprichardson/node-fs-extra/tree/11.4.1
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/fs-extra/11.4.1
