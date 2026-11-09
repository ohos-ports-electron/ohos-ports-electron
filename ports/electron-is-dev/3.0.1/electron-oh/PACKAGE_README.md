# @ohos-ports-electron/electron-is-dev

OpenHarmony Node / Electron-OH distribution of electron-is-dev 3.0.1 (MIT).
The JavaScript implementation is unchanged from upstream (zero patches).
This distribution changes only the npm identity, repository metadata and this
README (upstream readme preserved as README.upstream.md).

```sh
npm install @ohos-ports-electron/electron-is-dev
```

```js
import isDev from '@ohos-ports-electron/electron-is-dev';

if (isDev) {
	console.log('Running in development');
} else {
	console.log('Running in production');
}
```

This package must be used from the Electron main process. It is ESM
(`"type": "module"`), exports `index.js` / `index.d.ts`, and needs Node `>=18`
as upstream. Importing it outside Electron throws
`TypeError: Not running in an Electron environment!`, exactly as upstream.

`isDev` is `true` when the `ELECTRON_IS_DEV` environment variable is present and
`Number.parseInt(process.env.ELECTRON_IS_DEV, 10) === 1` (decimal-prefix
truncation, so `"01"` and `"1.5"` count as `1`). Otherwise it is derived from
`!electron.app.isPackaged`, unchanged from upstream.

## Electron-OH platform conditions

On HarmonyOS PC the Electron-OH launcher binary is always named `electron`, so
`electron.app.isPackaged` reports `false` and the default derivation returns
`true` unless the environment variable is set. This is the upstream
`!app.isPackaged` contract observed on Electron-OH, not a library defect. For a
production build, set `ELECTRON_IS_DEV=0`; for a forced development state, set
`ELECTRON_IS_DEV=1`. The device verification roster exercises both the
environment-variable branch and the `!app.isPackaged` derivation by using the
upstream `ELECTRON_FORCE_IS_PACKAGED` override to construct packaged/dev
contexts inside a real Electron-OH main process.

The verification project targets independent OpenHarmony Node (guard branch only:
a non-Electron host throws `TypeError`) and Electron-OH 34, 37 and 40 using one
frozen npm tarball, a shared 10-case roster derived from the upstream behavior,
and two cold starts per target. Exact runtime hashes, installation scope and
results are recorded in the contribution's release evidence. Renderers should
receive the boolean through a limited IPC API; keep contextIsolation enabled.

## Contents and provenance

The package contains the upstream JavaScript (`index.js`, `index.d.ts`), LICENSE,
package.json, this README and README.upstream.md. There are no native addons,
lifecycle scripts, Electron engines, HAPs, test projects or signing materials
inside this package.

Upstream documentation: README.upstream.md and
https://github.com/sindresorhus/electron-is-dev
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/electron-is-dev/3.0.1
