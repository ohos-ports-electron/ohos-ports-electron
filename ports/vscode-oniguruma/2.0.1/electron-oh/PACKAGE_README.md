# @ohos-ports-electron/vscode-oniguruma

OpenHarmony Node and Electron-OH distribution of Microsoft vscode-oniguruma
2.0.1 (MIT). Public exports and main.d.ts remain upstream. The original
onig.wasm remains byte-identical. When WebAssembly is unavailable, loadWASM
uses a bundled CommonJS asm.js translation of that same WASM, generated with
Binaryen 133. A supplied custom instantiator is still called. When WebAssembly
is available the original native WASM path and RuntimeError class are retained.

```sh
npm install @ohos-ports-electron/vscode-oniguruma@electron-oh
```

```js
const fs = require('fs')
const onig = require('@ohos-ports-electron/vscode-oniguruma')
const bytes = fs.readFileSync(require.resolve('@ohos-ports-electron/vscode-oniguruma/release/onig.wasm'))
await onig.loadWASM(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
const scanner = new onig.OnigScanner(['hello'])
try { console.log(scanner.findNextMatchSync('hello 鸿蒙', 0)) }
finally { scanner.dispose() }
```

Use Electron main or a Node Worker; expose only limited IPC to a renderer
with contextIsolation enabled. Each Worker initializes its own module.
The fallback is bundled in release/onig.asm.cjs; bundlers must retain this
sibling CommonJS file. This package supplies no runtime, SDK, native addon or
permission configuration. asm.js can be slower than native WASM; performance
and very large input workloads are outside the representative suite.

Device verification uses independent OpenHarmony Node and Electron-OH
25/34/37/40 app processes in --jitless mode, with the fallback executing real
Oniguruma regex operations. Host regressions separately cover native WASM.
Exact engines, source/byte hashes, cold-start results, Unicode offsets, scanner
options, disposal, loadWASM input forms and Worker exit are in release evidence.
This does not assert that the unmodified WASM runtime works in jitless apps.
Complete on-device npm CLI installation is not claimed.

Package files: upstream LICENSE.txt, NOTICES.txt, SECURITY.md, main.d.ts,
release/onig.wasm, patched release/main.js, package.json, this README,
README.upstream.md, generated release/onig.asm.cjs and BINARYEN-LICENSE.txt.
Upstream author and notices are retained. Binaryen's license is included for
the translation tooling/runtime helpers. Recipe and evidence:
https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/vscode-oniguruma/2.0.1
Upstream: https://github.com/microsoft/vscode-oniguruma
