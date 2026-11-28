# @ohos-ports-electron/xterm-addon-clipboard

OpenHarmony Node / Electron-OH distribution of `@xterm/addon-clipboard` 0.2.0 (MIT).
The JavaScript implementation is unchanged from upstream (zero patches).
This distribution changes the npm identity, repository metadata and this README
(upstream readme preserved as README.upstream.md).

```sh
npm install @ohos-ports-electron/xterm-addon-clipboard@beta
```

```js
const { Terminal } = require('@xterm/headless');
const { ClipboardAddon, Base64 } = require('@ohos-ports-electron/xterm-addon-clipboard');

const terminal = new Terminal();
terminal.loadAddon(new ClipboardAddon());
terminal.write('\x1b]52;c;aGVsbG8=\x07'); // OSC 52 copy "hello" to the clipboard
```

The full public API of `@xterm/addon-clipboard` 0.2.0 is retained: `ClipboardAddon`,
`Base64`, `BrowserClipboardProvider`, the `IBase64` / `IClipboardProvider` interfaces and the
`ClipboardSelectionType` enum. The addon registers an OSC 52 handler on the terminal parser;
data written as `pc;pd` writes base64-decoded text to the clipboard through the configured
`IClipboardProvider`, and `pc;?` reports the clipboard text back into the terminal as an
OSC 52 response. The default `BrowserClipboardProvider` uses the Web Clipboard API in a
renderer; a custom provider can be injected for headless Node / main-process use. The single
runtime dependency `js-base64@^3.7.5` resolves through npm at install time and is not
vendored into this tarball. The `@xterm/xterm` import in the shipped type declarations is
types-only; this package has no runtime dependency on `@xterm/xterm` and works with any
terminal exposing `parser.registerOscHandler` and `input`.

Use the main process or a Node runtime for headless clipboard work and expose results
through a limited IPC API to Electron renderers; keep contextIsolation enabled. In a
renderer the default `BrowserClipboardProvider` works against the real Clipboard API.
This package does not implement ArkTS APIs or supply a Node/Electron runtime.

## Platform conditions

The device verification project targets independent OpenHarmony Node and Electron-OH 34,
37 and 40 using one frozen npm tarball. The roster exercises the 0.2.0 public API:
`Base64` encode/decode round-trips (including invalid-input rejection), `ClipboardAddon`
OSC 52 copy (`pc;data`), OSC 52 query/report (`pc;?`) with an injected in-memory
`IClipboardProvider`, PRIMARY vs SYSTEM selection routing, and `dispose()` unregistering
the OSC 52 handler — each with two cold starts per target. The addon is pure JavaScript
with no JIT/WASM requirement; the device-node target runs `--jitless`.

On the device, `process.platform` reports `'openharmony'` (Electron-OH 40 reports
`'ohos'`); the addon has no platform-specific branch, so all roster assertions run the
same platform-independent code paths as upstream CI.

## Contents and provenance

The package contains the upstream distribution: `lib/addon-clipboard.js` (CJS),
`lib/addon-clipboard.mjs` (ESM), source maps, `src/ClipboardAddon.ts`, `typings/`,
LICENSE, package.json, this README and README.upstream.md. There are no native addons,
lifecycle scripts, Electron engines, HAPs, test projects or signing materials inside this
package.

Upstream documentation: README.upstream.md and https://github.com/xtermjs/xterm.js
Reproducible contribution recipe:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/xterm-addon-clipboard/0.2.0
