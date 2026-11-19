# @ohos-ports-electron/vue

OpenHarmony Node / Electron-OH distribution of vue 3.5.45 (MIT).
The JavaScript implementation is unchanged from upstream (zero patches).
This distribution changes the npm identity, repository metadata and this README
(upstream readme preserved as README.upstream.md).

```sh
npm install @ohos-ports-electron/vue@beta
```

```js
const { createApp, ref, h } = require('@ohos-ports-electron/vue');
```

The full public API of vue 3.5.45 is retained: reactivity (`reactive`, `ref`,
`computed`, `watch`, `effect`), the runtime (`createApp`, `h`, `defineComponent`,
lifecycle hooks), the subpath exports `@ohos-ports-electron/vue/compiler-sfc`,
`@ohos-ports-electron/vue/server-renderer` and `@ohos-ports-electron/vue/jsx-runtime`,
plus the browser/global and ESM bundler builds under `dist/`. The five runtime
dependencies are the upstream monorepo siblings `@vue/shared`, `@vue/runtime-dom`,
`@vue/compiler-dom`, `@vue/compiler-sfc` and `@vue/server-renderer` at exactly
`3.5.45`; they resolve through npm at install time and are not vendored into
this tarball.

Use the main process or a Node runtime for framework work and expose results
through a limited IPC API to Electron renderers; keep contextIsolation enabled.
The renderer can also load the shipped ESM browser build
(`dist/vue.esm-browser.js`) directly inside the Electron-OH renderer, which is
what the device verification roster exercises on real Chromium/ArkWeb DOM.
This package does not implement ArkTS APIs or supply a Node/Electron runtime.

## Platform conditions

The device verification project targets independent OpenHarmony Node and
Electron-OH 34, 37 and 40 using one frozen npm tarball. The roster is the
77-case upstream-derived suite: 63 device-node cases (reactivity, runtime-core
renderer/patch/scheduler/suspense/keepalive/teleport semantics on a custom host
renderer, compiler-core/compiler-dom/compiler-sfc/compiler-ssr contracts,
server-renderer output) and 14 electron-oh renderer cases (real DOM assertions:
createApp mount, nodeOps, patchClass/patchStyle/patchEvents/patchProps/
patchAttrs, v-model/v-on/v-show, useCssModule/useCssVars, customElement, vue
index reactivity), each with two cold starts per target. The SFC compiler cases
that need TypeScript ship the upstream-matched `typescript` 6.0.3 compiler with
the test application only (never inside this npm package). Exact runtime
hashes, installation scope, results and limitations are recorded in the
contribution's release evidence. The device-node target runs `--jitless`; vue
is pure JS with no JIT/WASM requirement.

On the device, `process.platform` reports `'openharmony'`; vue has no
platform-specific branch in its runtime, so all roster assertions run the same
platform-independent code paths as upstream CI. The SSR compiler output runs in
CJS mode inside the suite with the suite's `require` injected, which is the
upstream-documented execution mode.

## Contents and provenance

The package contains the upstream distribution: `dist/` (cjs, esm-bundler,
esm-browser and global builds plus type declarations), `index.js`/`index.mjs`,
`compiler-sfc/`, `server-renderer/`, `jsx-runtime/`, `jsx.d.ts`, LICENSE,
package.json, this README and README.upstream.md. There are no native addons,
lifecycle scripts, Electron engines, HAPs, test projects or signing materials
inside this package.

Upstream documentation: README.upstream.md and https://github.com/vuejs/core
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/vue/3.5.45
