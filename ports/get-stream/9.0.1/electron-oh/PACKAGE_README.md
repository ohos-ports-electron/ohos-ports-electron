# @ohos-ports-electron/get-stream

OpenHarmony Node / Electron-OH distribution of get-stream 9.0.1 (MIT).
The JavaScript implementation is unchanged from upstream `get-stream`
(zero patches). This distribution changes the npm identity, repository
metadata and this README only.

```sh
npm install @ohos-ports-electron/get-stream
```

```js
import getStream from '@ohos-ports-electron/get-stream';

// Node.js stream
console.log(await getStream(stream));

// Buffer / ArrayBuffer / array
const buffer = await getStream.buffer(stream);
const arrayBuffer = await getStream.arrayBuffer(stream);
const array = await getStream.array(stream);

// web ReadableStream, async iterables, maxBuffer and partial data on error
const text = await getStream(readableStream);
const errored = await getStream(stream, {maxBuffer: 1024});
```

`get-stream` is a pure ESM package (`"type": "module"`): import it from ESM
code or from an ESM-aware dynamic `import()`. Its public API, exports map,
`MaxBufferError`, `maxBuffer` option and error contract (`error.bufferedData`
on partial reads) behave as upstream. Use it in the Electron main process (or
any Node runtime) and expose results through a limited IPC API to renderers;
keep contextIsolation enabled. This package does not implement ArkTS APIs or
supply a Node/Electron runtime.

## Platform conditions

The app-domain sandbox on OpenHarmony applies to the demo host runtime, not to
this package. The library is pure JavaScript with no JIT/WASM requirement; the
verification hosts run under `--jitless` (the app-domain W^X constraint) and the
independent Node host LD_PRELOADs a syscall fallback shim (io_uring/close_range
to ENOSYS) supplied by the demo runtime, not by this package. No platform logic
was changed. Two test-side platform equivalents were applied by the demo harness
(not the library): web ReadableStream ponyfill (`@sec-ant/readable-stream`,
unchanged npm dependency) and an Electron-OH V8 TextDecoder over-length guard;
these are recorded in the contribution's release evidence.

The verification project targets independent OpenHarmony Node and
Electron-OH 34, 37 and 40 using one frozen npm tarball, the unchanged upstream
ava roster (189 assertions across 10 test files) and two cold starts per target.
Exact runtime hashes, installation scope, results and limitations are recorded
in the contribution's release evidence.

## Contents and provenance

The package contains the upstream JavaScript (`source/*.js`, `source/index.d.ts`),
license, package.json, this README and README.upstream.md. It has two pure-JS
runtime dependencies (`@sec-ant/readable-stream`, `is-stream`) resolved by npm at
install time; they are not vendored into the tarball. There are no native
addons, lifecycle scripts, Electron engines, HAPs, test projects or signing
materials inside this package.

Upstream documentation: README.upstream.md and https://github.com/sindresorhus/get-stream
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/get-stream/9.0.1
