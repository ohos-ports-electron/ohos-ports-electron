# @ohos-ports-electron/7zip-min

OpenHarmony Node / Electron-OH distribution of 7zip-min 3.0.1 (MIT).
The JavaScript implementation is unchanged from upstream `7zip-min`
(zero source patches). This distribution changes the npm identity, repository
metadata, the dependency resolution for the bundled 7za binary and this README.

```sh
npm install @ohos-ports-electron/7zip-min
```

```js
const _7z = require('@ohos-ports-electron/7zip-min');

await _7z.pack('myFolder', 'archive.7z');
await _7z.unpack('archive.7z', 'outputFolder');
const files = await _7z.list('archive.7z');
```

`7zip-min` is a small promise/callback wrapper around a 7za subprocess. It
exposes `pack`, `unpack`, `unpackSome`, `list`, `cmd`, `config` and
`getConfig`. It supports both CJS `require` and ESM `import` entry points and
full TypeScript definitions, exactly as upstream. Use it in the Electron main
process (or any Node runtime) and expose results through a limited IPC API to
renderers; keep contextIsolation enabled.

## 7za binary supply

Upstream `7zip-min` depends on `7zip-bin` (5.1.1). On OpenHarmony the bundled
npm `7zip-bin` linux/arm64 binary is a glibc ELF that cannot execute on the
OHOS musl runtime, so this port resolves the `7zip-bin` dependency to the
published `@ohos-ports-electron/7zip-bin` port (npm alias), whose
`openharmony/arm64/7za` is a self-contained static OHOS build. `path7za`
therefore resolves to an executable binary on all verified hosts. The port
ships the dependency as a bundled package (`node_modules/7zip-bin`) inside the
tarball, so installation works offline from the single frozen tarball.

The upstream README is preserved as `README.upstream.md`.

## Platform conditions

OpenHarmony app-domain sandbox restrictions apply to the demo host runtime,
not to this package. The library is pure JavaScript; the verification hosts
run under `--jitless` (app-domain W^X constraint) and the independent Node host
LD_PRELOADs a syscall fallback shim (io_uring/close_range to ENOSYS) supplied
by the demo runtime, not by this package. No platform logic was changed. The
demo suite exercises real pack/unpack/list/error-contract behavior against the
shipped 7za binary on the device.

The verification project targets independent OpenHarmony Node and
Electron-OH 34, 37 and 40 using one frozen npm tarball, the 30-case device
roster (pack/unpack/list/cmd/config API surface, error contracts and dual-module
identity) and two cold starts per target. Exact runtime hashes, installation
scope, results and limitations are recorded in the contribution's release
evidence.

## Contents and provenance

The package contains the upstream `src/index.js`, `src/index.mjs`,
`src/index.d.ts`, `src/index.d.mts`, `LICENSE`, `package.json`, this README,
`README.upstream.md`, and the bundled `node_modules/7zip-bin`
(@ohos-ports-electron/7zip-bin 5.2.0-electron-oh.0, the OHOS 7za supply). There
are no lifecycle scripts, Electron engines, HAPs, test projects or signing
materials inside this package.

Upstream documentation: README.upstream.md and https://github.com/onikienko/7zip-min
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/7zip-min/3.0.1
