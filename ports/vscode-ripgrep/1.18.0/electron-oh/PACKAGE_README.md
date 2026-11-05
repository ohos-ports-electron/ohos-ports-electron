# @ohos-ports-electron/vscode-ripgrep

HarmonyOS arm64 distribution of `@vscode/ripgrep@1.18.0` (MIT). The ESM public
API remains `rgPath`; `binPathFor` belongs to the separate upstream
`@vscode/ripgrep-universal` package and is not part of this package.

```sh
npm install @ohos-ports-electron/vscode-ripgrep@beta
```

```js
import { rgPath } from '@ohos-ports-electron/vscode-ripgrep';
import { spawn } from 'node:child_process';
spawn(rgPath, ['pattern', 'directory'], { stdio: 'inherit' });
```

For `ohos` / `openharmony` arm64, the matching upstream static musl binary is
included at `bin/ohos-arm64/rg`; no platform-specific optional npm install is
needed. Other OSes retain upstream optional dependency resolution and behavior.

HAP resource directories cannot execute ELF files. Package the exact bundled rg
bytes into a private HNP, then set `VSCODE_RIPGREP_PATH` to its installed absolute
executable path **before importing** this module (in each execution context).
The five-target demos use this deployment contract and call the exported
`rgPath` in main/Node and Worker. Do not replace it with an unrelated binary.
Normal command-line Node installations may use the packaged path directly when
their install directory permits execution. Only HarmonyOS arm64 is validated.

Electron-OH 40 (`v40.0.1-release`, embedded Node 24.11.1) requires asynchronous
`spawn`: synchronous spawning was observed to stall. Worker **subprocess exit**
also requires the engine-bound child-reaper adapter supplied with the verified
demo/runtime setup. It calls the existing child watcher on that Worker's own
libuv loop and preserves real exit status and cleanup. The adapter is guarded
by the exact engine SHA256; see the recipe's runtime conditions and evidence.
The npm package does not modify or install an Electron runtime. Main-process
asynchronous spawning works without this Worker adapter. Other tested targets
and independent Node execute the same asynchronous assertions without it.

The representative suite covers real files, regex, glob/JSON output, Unicode,
stdin, exit codes and Worker shutdown. JIT/WASM is not required; demos use
`--jitless`. This is not the complete upstream ripgrep test suite. Dependencies
are installed/locked on the host; complete device npm CLI installation is not
claimed. Runtimes, HAPs, SDKs and signing materials are outside the npm package.

Upstream documentation: [README.upstream.md](README.upstream.md).
Native provenance and license: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Recipe: https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/vscode-ripgrep/1.18.0
