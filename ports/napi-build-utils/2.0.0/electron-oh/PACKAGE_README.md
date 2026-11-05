# @ohos-ports-electron/napi-build-utils

OpenHarmony Node / Electron-OH distribution of napi-build-utils 2.0.0 (MIT).
The JavaScript implementation is unchanged from upstream inspiredware/napi-build-utils
(zero patches). This distribution changes the npm identity, repository metadata and
the package.json description/bugs.

```sh
npm install @ohos-ports-electron/napi-build-utils
```

```js
const utils = require('@ohos-ports-electron/napi-build-utils')

utils.isNapiRuntime('napi')              // true
utils.getNapiVersion()                   // '10' (current N-API version)
utils.getNapiBuildVersions()             // ['2','3','10'] (package-declared, deduped)
utils.packageSupportsVersion(2)          // true
utils.isSupportedVersion('3')            // true when env N-API >= 3
utils.getBestNapiBuildVersion()          // highest declared version <= env N-API
```

This is a pure-JavaScript helper library for tools that build N-API native
add-ons (prebuild, prebuild-install, node-gyp-build, etc.). It has zero
runtime dependencies, no native code and no install scripts.

## Platform conditions

The library reads `package.json` from the process working directory at module
load time (`require(path.resolve('package.json'))` in `index.js:5`). On
OpenHarmony the demo harness seeds a minimal `package.json` (with
`binary.napi_versions`) into the process CWD when it is missing; the library
source is not modified. The verification Node host LD_PRELOADs a syscall
fallback shim (io_uring/close_range to ENOSYS) supplied by the demo runtime,
not by this package; Electron-OH processes run their embedded Node through the
privileged runtime path. Demos run with `--jitless`; this library has no
JIT/WASM requirement.

The verification project targets independent OpenHarmony Node and
Electron-OH 34, 37 and 40 using one frozen npm tarball and the 8-case
upstream-derived roster with two cold starts per target. Exact runtime
hashes, installation scope, results and limitations are recorded in the
contribution's release evidence.

## Contents and provenance

The package contains the upstream JavaScript (`index.js`), `index.md`,
LICENSE, `package.json`, this README and the upstream `.github` test workflow.
There are no native addons, lifecycle scripts, Electron engines, HAPs, test
projects or signing materials inside this package.

Upstream: https://github.com/inspiredware/napi-build-utils
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/napi-build-utils/2.0.0
