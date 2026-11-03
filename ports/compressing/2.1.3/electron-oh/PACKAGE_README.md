# @ohos-ports-electron/compressing

OpenHarmony Node / Electron-OH distribution of compressing 2.1.3 (MIT).
The JavaScript implementation is unchanged from upstream (zero patches).
This distribution changes the npm identity, repository metadata and this README.

```sh
npm install @ohos-ports-electron/compressing@electron-oh
```

```js
const { gzip, tar, tgz, zip } = require('@ohos-ports-electron/compressing')

// gzip a file, then restore it
await gzip.compressFile('app.log', 'app.log.gz')
await gzip.uncompress('app.log.gz', 'app.restored.log')

// archive / restore a directory as .tgz
await tgz.compressDir('project', 'project.tgz')
await tgz.uncompress('project.tgz', 'out/')
```

Stream forms (`tar.Stream`, `tgz.FileStream`, `zip.UncompressStream`, ...)
behave as upstream. Use the main process or a Node runtime for file system
work and expose results through a limited IPC API to Electron renderers;
keep contextIsolation enabled. This package does not implement ArkTS APIs
or supply a Node/Electron runtime.

## Platform conditions

The OpenHarmony app-domain sandbox disallows `symlink()` (EACCES), so archives
containing real symlink entries finish with a deterministic error, entries
whose symlink target escapes the destination directory are skipped with a
warning (never written outside), and path-traversal entry names such as
`../../evil.txt` are normalized back inside the destination directory. HMDFS
masks the other-read permission bit (0o004) and `chmod()` is not effective,
so exact `mode` equality on extraction is verified under the masked
semantics. These are recorded platform conditions, unchanged from upstream
logic.

The verification project targets independent OpenHarmony Node and
Electron-OH 34, 37 and 40 using one frozen npm tarball, real compress and
uncompress assertions (178-case upstream-derived roster) and two cold starts
per target. Exact runtime hashes, installation scope, results and
limitations are recorded in the contribution's release evidence. The test
applications run with `--jitless`; compressing has no JIT/WASM requirement.
Device-side dependency closure resolves `tar-stream@1.6.2`
(`tar-stream@1.5.5` hangs on Node 24 `TarFileStream` packing paths; any
fresh `npm install` of 2.1.3 with `^1.5.2` resolves 1.6.2).

## Contents and provenance

The package contains the upstream JavaScript (`index.js`, `index.d.ts`,
`lib/`), LICENSE, package.json, this README and README.upstream.md. There
are no native addons, lifecycle scripts, Electron engines, HAPs, test
projects or signing materials inside this package.

Upstream documentation: README.upstream.md and
https://github.com/node-modules/compressing
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/compressing/2.1.3
