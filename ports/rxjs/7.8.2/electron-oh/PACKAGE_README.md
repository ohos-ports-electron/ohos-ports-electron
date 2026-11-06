# @ohos-ports-electron/rxjs

OpenHarmony distribution of RxJS 7.8.2 (Apache-2.0). Upstream JavaScript,
CommonJS/ESM/UMD entries, public APIs, TypeScript declarations, tslib dependency,
and licenses are preserved. Only distribution metadata and README change.
Full upstream documentation is in README.upstream.md.

```sh
npm install @ohos-ports-electron/rxjs@beta
```

```js
const { of, map, filter } = require('@ohos-ports-electron/rxjs');
of(1, 2, 3).pipe(map(x => x * 2), filter(x => x > 2)).subscribe(console.log);
```

The representative device suite covers streams/operators, subjects, scheduling,
errors/retry, completion/cancellation/teardown, Node events, CommonJS and ESM
entries, UMD execution, virtual-time scheduling, and Worker execution/exit.
Electron calls run in the main process with isolated renderer IPC. Browser DOM,
animationFrames, ajax/WebSocket/network access, every upstream operator and the
complete upstream test roster are outside this suite. The device launchers use
--jitless; RxJS requires neither JIT nor WASM. Dependencies are installed normally
on the host and locked into HAPs; full device npm CLI installation is not claimed.
No native addon, engine, SDK, HAP, signing material, or test harness is in this npm
package. Exact runtimes and results are bound to the frozen tgz by the recipe.

Upstream: https://github.com/ReactiveX/rxjs/tree/7.8.2
Recipe: https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/rxjs/7.8.2
