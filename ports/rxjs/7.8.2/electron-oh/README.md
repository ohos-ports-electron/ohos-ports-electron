# RxJS runtime and release notes

Install `npm i @ohos-ports-electron/rxjs@beta`. Stable 7.8.2 CJS, ESM/ESM5, UMD,
types and source entries are retained; native Node dynamic import resolves the
upstream Node export, while ESM builds remain available to bundlers. Tests cover
CJS, public dynamic import and real UMD vm execution, rather than claiming a new
native-ESM packaging format. No platform shim is added to the library.

See ../README.md for the exact package/recipe distinction, scope, reproduction,
and CI. inputs.lock.json fixes the registry baseline and final tgz; package-
inventory.json covers every member. Package bytes are reconstructed independently
and compared before release. release-evidence.json links recorded fresh device
runs. Full projects and signed HAPs are retained in the external delivery project.
The standalone Node runtime uses a separately tracked MIT io_uring syscall helper;
its source, hash, exact engine and device OS are in the evidence archive. This
runtime helper is outside npm. Electron 25 uses jitless startup before V8
initialization; 34/40 use documented SDK API declarations matching their framework.

Only trusted main push jobs in npm-publish publish the frozen candidate. Package-
specific npm trust must name rxjs-electron-oh.yml and independently allow direct
publish and dist-tag management. The active channel is beta; latest is maintained.
Historic electron-oh tags are preserved. Default-off scripts, PR/fork/manual
rejection, byte mismatch and legacy-channel rejection are regression tested.
