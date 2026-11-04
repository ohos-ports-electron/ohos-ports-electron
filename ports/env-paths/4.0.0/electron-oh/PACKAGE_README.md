# @ohos-ports-electron/env-paths

OpenHarmony Node / Electron-OH distribution of env-paths 4.0.0 (MIT).
The JavaScript implementation is unchanged from upstream (zero patches).
This distribution changes the npm identity, repository metadata and this README
(upstream readme preserved as README.upstream.md).

```sh
npm install @ohos-ports-electron/env-paths@electron-oh
```

```js
import envPaths from '@ohos-ports-electron/env-paths';

const paths = envPaths('unicorn');
// on OpenHarmony PC the library falls into the linux() branch:
// {
//   data:   '/storage/Users/currentUser/.local/share/unicorn-nodejs',
//   config: '/storage/Users/currentUser/.config/unicorn-nodejs',
//   cache:  '/storage/Users/currentUser/.cache/unicorn-nodejs',
//   log:    '/storage/Users/currentUser/.local/state/unicorn-nodejs',
//   temp:   '/tmp/unicorn-nodejs'
// }
```

An optional `suffix` changes the last path segment (`envPaths('unicorn', {suffix: 'horn'})`
ends with `unicorn-horn`); an empty suffix disables the suffix segment. Unsafe names or
suffixes (empty string, path separators, traversal like `../../x`) throw
`Unsafe filename` exactly as upstream. The independent runtime dependency
`is-safe-filename@^0.1.0` is resolved through npm at install time; it is not
vendored into this tarball.

This package is ESM (`"type": "module"`), exports `index.js` / `index.d.ts`, and needs
Node `>=20` as upstream. Use the main process or a Node runtime for path work and expose
results through a limited IPC API to Electron renderers; keep contextIsolation enabled.
This package does not implement ArkTS APIs or supply a Node/Electron runtime.

## Platform conditions

The device verification project targets independent OpenHarmony Node and Electron-OH 34,
37 and 40 using one frozen npm tarball, real path-generation assertions (the 6-case
upstream-derived roster covering default/custom/no suffix, invalid name/suffix rejection
and XDG_*_HOME override) and two cold starts per target. Exact runtime hashes, installation
scope, results and limitations are recorded in the contribution's release evidence. The
test applications run with `--jitless`; env-paths is pure JS with no JIT/WASM requirement.

On the device, `process.platform` reports `'openharmony'`, so the upstream test guard
`process.platform === 'linux'` is not hit by the ava suite; the XDG_*_HOME override case is
recruited with an equivalent construction (guard widened to the linux alias), keeping the
upstream assertion body byte-identical. `os.homedir()` returns `/storage/Users/currentUser`
and `os.tmpdir()` returns `/tmp` (sandbox mapping); XDG_*_HOME environment overrides apply
as upstream.

## Contents and provenance

The package contains the upstream JavaScript (`index.js`, `index.d.ts`), LICENSE,
package.json, this README and README.upstream.md. There are no native addons, lifecycle
scripts, Electron engines, HAPs, test projects or signing materials inside this package.

Upstream documentation: README.upstream.md and https://github.com/sindresorhus/env-paths
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/env-paths/4.0.0
