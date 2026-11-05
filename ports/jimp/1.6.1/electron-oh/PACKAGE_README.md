# @ohos-ports-electron/jimp

HarmonyOS PC / Electron-OH port of [jimp](https://www.npmjs.com/package/jimp) 1.6.1 (an image processing
library written entirely in JavaScript).

This is a metadata-only port: the published `jimp@1.6.1` package is a pure-JavaScript package with no
native code, so the runtime files are byte-identical to the upstream npm release. The package name,
version and repository metadata were adjusted for the `@ohos-ports-electron` distribution channel; no
functional patches are applied. The runtime dependencies remain the upstream `@jimp/*@1.6.1` pure-JS
packages from the public npm registry.

## Install

```sh
npm install @ohos-ports-electron/jimp
```

```js
import { Jimp } from '@ohos-ports-electron/jimp';

const image = await Jimp.read('/data/local/tmp/photo.png');
image.resize({ w: 256, h: 256 });
image.greyscale();
const buffer = await image.getBuffer('image/png');
```

The package works on standalone HarmonyOS Node and Electron-OH (34/37/40). Like other ports in this
repository, demos run with `--jitless`; jimp is pure JS and has no JIT/WASM dependency.

## Verified on device

The frozen candidate `1.6.1-electron-oh.0` was verified on a HAD-W32 device (OpenHarmony 7.0.0.109,
API 26, aarch64) across the four targets: standalone Node 24.13.0 and Electron-OH 34.8.6 / 37.2.0 /
40.0.1, two fresh cold starts each, using the 45-case functional roster (read/decode/encode,
compositing, geometry, color, text, hash/diff) shared by every target. See
[release-evidence.json](release-evidence.json) and the linked device evidence archive.

## Sources

- Upstream npm package: `jimp@1.6.1` (registry tarball, SHA256 `e47160eb…f0101f6`).
- Upstream repo: https://github.com/jimp-dev/jimp
- Recipe inputs and frozen candidate: [inputs.lock.json](inputs.lock.json).
