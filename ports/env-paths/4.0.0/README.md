# env-paths 4.0.0 · Electron-OH recipe

Builds **@ohos-ports-electron/env-paths@4.0.0-electron-oh.0** from the locked upstream
env-paths 4.0.0 registry tarball. All distributed JavaScript files (`index.js`, `index.d.ts`)
are byte-identical to upstream; this port is zero-patch. Changes are npm
identity/repository metadata and the README; the original readme is preserved as
`README.upstream.md`. MIT license and original authors are retained. The runtime
dependency `is-safe-filename@^0.1.0` keeps resolving through npm at install time.

## npm distribution

Candidate SHA256: `36210703cd1991aa7e74d9a098ee06d709f8b51e27fbeea6cfd62b815b0e8f0e`.
The package contains 6 files: `index.js`, `index.d.ts`, `license`, `package.json`,
`readme.md` (this port's package readme) and `README.upstream.md`. The exact paths and
SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

env-paths is pure ESM with one pure-JS runtime dependency (`is-safe-filename@^0.1.0`,
resolved by npm at install time, not vendored). There are no engines, HAPs, SDKs, tests,
signing keys or lifecycle scripts in this npm package. Existing platform behavior and
public APIs are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to readme.md |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host env-paths suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero-patch** (`patchs/` stays empty): package.json identity/repository
changes are applied by build.py directly from inputs.lock.json.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging,
manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not
publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/env-paths-build
python3 electron-oh/tools/release.py bind --bundle /tmp/env-paths-build
python3 electron-oh/tools/release.py verify --bundle /tmp/env-paths-build
python3 electron-oh/tools/release.py host --bundle /tmp/env-paths-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts
per target on one HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive
serial window. The device roster is the same 6-case suite on every target (upstream
`test.js` port, XDG case recruited with an equivalent linux-alias guard construction),
driven by the real env-paths API. Host CI separately replays the host-safe subset of the
same assertions; it does not claim fresh device execution.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 6/6 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 6/6 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 6/6 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 6/6 |

On OpenHarmony the device Node reports `process.platform === 'openharmony'`; env-paths'
non-darwin/win32 fallback (`index.js:60-68`) routes to the linux() XDG logic, which is the
behavior verified by the roster. The independent Node host LD_PRELOADs a syscall fallback
shim (io_uring/close_range to ENOSYS) supplied by the demo runtime, not by this package.
Demos run with `--jitless`; env-paths is pure JS with no JIT/WASM requirement.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and [dedicated workflow](../../../.github/workflows/env-paths-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity.
The existing version path verifies bytes and still verifies both latest and electron-oh
tags. A different existing integrity or another tag target is rejected. Actual publication
state is determined by npm/CI receipts, not this preparation document.
