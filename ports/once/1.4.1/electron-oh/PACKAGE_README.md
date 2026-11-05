# @ohos-ports-electron/once

OpenHarmony Node / Electron-OH distribution of once 1.4.1 (BlueOak-1.0.0).
The JavaScript implementation is unchanged from upstream (zero patches).
This distribution changes the npm identity, repository metadata and this README
(upstream readme preserved as README.upstream.md).

```sh
npm install @ohos-ports-electron/once
```

```js
const once = require('@ohos-ports-electron/once');

const fn = once(function (v) {
  return v + 1;
});

console.log(fn(1)); // 2  (original function runs)
console.log(fn(2)); // 2  (cached value returned)
console.log(fn.called); // true
```

once is a CommonJS package (main `once.js`) with a single runtime dependency
`wrappy@^1.0.2`, resolved through npm at install time; it is not vendored into
this tarball.

Exports:

- `once(fn)` — wrap `fn` so it runs exactly once; later calls return the cached
  `f.value` and set `f.called = true`. `this` and arguments pass through on the
  first call; any `ownProperty` on `fn` is forwarded to the wrapper.
- `once.strict(fn)` — like `once` but a second call throws `new Error(f.onceError)`.
  The default message is `"<name> shouldn't be called more than once"` where
  `<name>` is `fn.name` or `` `Function wrapped with ``once` `` for anonymous
  functions. Override by setting `foo.onceError` on the wrapper.
- `once.proto()` — installs `Function.prototype.once` / `Function.prototype.onceStrict`
  convenience methods. This port keeps the upstream 1.4.1 export
  `module.exports.proto` (the npm-published 1.4.0 assigns `.proto` to an inner
  function instead, so `require('once').proto` is `undefined` there; 1.4.1 fixes
  that and is the version this distribution is built from).

This package does not implement ArkTS APIs or supply a Node/Electron runtime.

## Platform conditions

The device verification project targets independent OpenHarmony Node and Electron-OH 34,
37 and 40 using one frozen npm tarball, real function-call assertions (the 6-case
upstream-derived roster covering the 1000-call cache loop, `fn.once()` /
`fn.onceStrict()` proto helpers, strict re-call errors with named/anonymous/custom
messages, and property forwarding) and two cold starts per target. Exact runtime
hashes, installation scope, results and limitations are recorded in the
contribution's release evidence. The test applications run with `--jitless`; once
is pure JS with no JIT/WASM requirement.

## Contents and provenance

The package contains the upstream JavaScript (`once.js`), LICENSE.md, package.json,
this README and README.upstream.md. There are no native addons, lifecycle scripts,
Electron engines, HAPs, test projects or signing materials inside this package.

Upstream documentation: README.upstream.md and https://github.com/isaacs/once
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/once/1.4.1
