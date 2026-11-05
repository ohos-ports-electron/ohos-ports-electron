# prebuild-install 7.1.3 · Electron-OH recipe

Builds **@ohos-ports-electron/prebuild-install@7.1.3-electron-oh.0** from the locked
`@scrypted/prebuild-install@7.1.3` registry tarball (the maintained Scrypted fork of the
upstream prebuild/prebuild-install 7.1.3 package). All distributed JavaScript files are
byte-identical to the upstream fork tarball; this port is **zero-patch**. Changes are npm
identity/repository metadata, the bugs field, the description suffix and the README; the
original readme is preserved as `README.upstream.md`. MIT license and original authors are
retained. The 12 pure-JS runtime dependencies keep resolving through npm at install time.

## npm distribution

Candidate SHA256: `dc5f722fb5c7726fdd8213efc29394733e1183ff99e23a4850b805e6499a1d92`.
The package contains 16 files (15 upstream + `README.upstream.md`). The exact paths and
SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

prebuild-install is pure CommonJS with 12 pure-JS runtime dependencies (`detect-libc`,
`expand-template`, `github-from-package`, `minimist`, `mkdirp-classic`, `napi-build-utils`,
`node-abi`, `pump`, `rc`, `simple-get`, `tar-fs`, `tunnel-agent`, resolved by npm at install
time, not vendored). There are no engines, HAPs, SDKs, tests, signing keys or lifecycle
scripts in this npm package. Existing platform behavior and public APIs are retained
(`download()` export + `prebuild-install` CLI).

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host prebuild-install suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero-patch** (`patchs/` stays empty): package.json identity/repository
changes are applied by build.py directly from inputs.lock.json.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging,
manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not
publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/prebuild-install-build
python3 electron-oh/tools/release.py bind --bundle /tmp/prebuild-install-build
python3 electron-oh/tools/release.py verify --bundle /tmp/prebuild-install-build
python3 electron-oh/tools/release.py host --bundle /tmp/prebuild-install-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts
per target on one HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive
serial window. The device roster is the same 37-case suite on every target (upstream
util/log/proxy/rc/download/asset/skip tests ported, plus the generated smoke/callback gap
cases f0104a/b/f0105a/b), driven by the real download/CLI behavior with self-contained
local-HTTP/nock content sources. Host CI separately replays the host-safe subset of the
same assertions; it does not claim fresh device execution.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 37/37 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 37/37 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 37/37 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 37/37 |

On OpenHarmony the device Node reports `process.platform === 'openharmony'`; the tool
computes the `openharmony-arm64-<abi>` tuple and all content sources are local-HTTP / nock
equivalents (no device egress). The independent Node host LD_PRELOADs a syscall fallback
shim (io_uring/close_range to ENOSYS) supplied by the demo runtime, not by this package.
Demos run with `--jitless`; prebuild-install is pure JS with no JIT/WASM requirement. The
f0104b recognition contract proves the same NDK N-API fixture loads from its install-time
location on the device-node host; the electron hosts record the sealed exec-labeled
location as the platform fact (e34 surfaces the dlopen failure as `Cannot find module`,
e37/40 as `loading shared library`).

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and [dedicated workflow](../../../.github/workflows/prebuild-install-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity.
The existing version path verifies bytes and still verifies both latest and beta
tags. A different existing integrity or another tag target is rejected. Actual publication
state is determined by npm/CI receipts, not this preparation document.
