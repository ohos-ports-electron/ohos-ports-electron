# which 7.0.0 · Electron-OH recipe

Builds **@ohos-ports-electron/which@7.0.0-electron-oh.0** from the locked upstream which 7.0.0 registry tarball.
All three upstream runtime files (lib/index.js, bin/which.js, LICENSE) are byte-identical to upstream; this port is zero-patch. Changes are npm identity/repository metadata and the README; the original README is preserved as README.upstream.md. The ISC LICENSE and the `bin` map (`node-which`) are retained unchanged.

## npm distribution

The package contains 6 files; the exact paths and SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

- `LICENSE`
- `README.md`
- `README.upstream.md`
- `lib/index.js`
- `bin/which.js` (executable mode preserved)
- `package.json`

which has one pure-JS runtime dependency (isexe ^4.0.0) resolved by npm at install time; it is not vendored into the tarball. There are no engines, HAPs, SDKs, tests, signing keys or lifecycle scripts in this npm package. Existing platform behavior and public APIs are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host which suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero-patch** (`patchs/` stays empty): package.json identity/repository changes are applied by build.py directly from inputs.lock.json, mirroring the upstream metadata rewrite.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging, manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/which-build
python3 electron-oh/tools/release.py bind --bundle /tmp/which-build
python3 electron-oh/tools/release.py verify --bundle /tmp/which-build
python3 electron-oh/tools/release.py host --bundle /tmp/which-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target on one HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive serial window. The device roster is the 33-case upstream-derived suite on the Node target (22 `test/index.js` cases shared by every target plus 11 `test/bin.js` CLI cases that re-exec the command through `process.execPath`, which only exists where a standalone Node runtime is bundled; the Electron targets run the 22 shared cases and record the 11 CLI cases as host-restricted with per-case reasons). Host CI separately replays the host-safe subset of the same assertions; it does not claim fresh device execution.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 33/33 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 22/22 (11 CLI host-restricted) |
| electron37 | 37.2.0 | 22.17.0 | 2 × 22/22 (11 CLI host-restricted) |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 22/22 (11 CLI host-restricted) |

Platform conditions on OpenHarmony are recorded, not patched around: `process.platform` is `openharmony`, so the upstream POSIX executable check (stat mode bits and uid/gid via isexe) applies and the Windows `PATHEXT` branch stays inert exactly as on other non-win32 hosts; the five win32-only `pathExt` upstream cases are excluded from the roster as platform-inapplicable. The independent Node host LD_PRELOADs a syscall fallback shim (io_uring/close_range to ENOSYS) supplied by the demo runtime, not by this package, and the demo Node host spawns CLI subprocesses through a wrapper with explicit `--jitless --expose-gc` argv (app-domain W^X); Electron processes run their embedded Node without those injections. Demos run with `--jitless`; which has no JIT/WASM requirement. The CLI fixtures (`node`, `tap`, `which` shell stubs) that the CLI roster expects on PATH are supplied by the demo runtime's private bin directory, not by this package.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md), [repository releasing guide](../../../docs/RELEASING.md), and [dedicated workflow](../../../.github/workflows/which-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing version path verifies bytes and still verifies both latest and beta tags; a legacy electron-oh tag is only removed when it points at this validated candidate, and publication never recreates it. A different existing integrity or another tag target is rejected. Actual publication state is determined by npm/CI receipts, not this preparation document.
