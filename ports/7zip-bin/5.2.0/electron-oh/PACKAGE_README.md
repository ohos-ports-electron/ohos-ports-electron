# @ohos-ports-electron/7zip-bin

HarmonyOS PC / Electron-OH port of [`7zip-bin`](https://github.com/develar/7zip-bin)
(`@ohos-ports/7zip-bin@5.2.0-beta.0`, upstream 7zip-bin 5.2.0). 7-Zip precompiled
binaries plus a small CommonJS resolver that exposes the platform 7za path.

```js
const { path7za, path7x } = require('@ohos-ports-electron/7zip-bin');
```

## Layout

The npm tarball keeps every upstream platform payload (linux / mac / win) and adds
the `openharmony/` payload used by HarmonyOS PC:

| File | Purpose |
| --- | --- |
| `index.js` | resolves `path7za` (and `path7x`) from `process.platform` / `process.arch`; `openharmony` branch is already included in the baseline package (zero patches) |
| `7x.sh` | `path7x` target script |
| `openharmony/arm64/7za` | HarmonyOS aarch64 `7za` binary (statically linked ELF with a `.codesign` segment, sha256 `a3316c3d…ef0`) |
| `linux/`, `mac/`, `win/` | upstream platform binaries, unchanged |

Executable payloads (`7za`, `7za.exe`, `7x.sh`) are packed with the executable bit.

## HarmonyOS PC usage note

On HarmonyOS PC the app-domain SELinux policy only allows `exec` of ELF payloads
installed as direct children of the private HNP `bin/` directory (or a separate
HNP), not arbitrary `node_modules` paths. `path7za` from this package resolves the
library-contract path; consumers that need to spawn 7za must supply the same
binary from an exec-permitted location (HNP `bin/`). The recorded device demos
deploy the identical `openharmony/arm64/7za` payload (`sha256 a3316c3d…ef0`) as
HNP `bin/7za` and verify byte equality.

## License

MIT (retained from upstream).
