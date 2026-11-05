# napi-build-utils 2.0.0 · Electron-OH recipe

Builds **@ohos-ports-electron/napi-build-utils@2.0.0-electron-oh.0** from the locked upstream napi-build-utils 2.0.0 registry tarball.
The upstream runtime files (index.js, index.md, LICENSE, README.md, .github workflow) are byte-identical to the locked source commit; this port is **zero-patch**. Changes are npm identity/repository/description/bugs metadata only (`patchs/` stays empty).

## npm distribution

The package contains 6 files; the exact paths and SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

- `.github/workflows/run-npm-tests.yml` (upstream, unchanged)
- `index.js` (unchanged)
- `index.md` (upstream, empty after the upstream's npm-doc change)
- `LICENSE` (unchanged, MIT)
- `package.json` (identity + repository metadata)
- `README.md` (upstream, unchanged)

napi-build-utils has no runtime dependencies. There are no native addons, engines, HAPs, SDKs, test projects, signing keys or lifecycle scripts in this npm package. Existing platform behavior and public APIs are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline/candidate hashes, repository identity, required tags | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | No (upstream README retained) |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, recipe, device evidence and publication checks | No |
| electron-oh/tests/suite.cjs | Host-safe regression suite (8 cases + identity/hash checks) | No |
| electron-oh/tests/release-contract.py | Publication guard rejection tests | No |
| electron-oh/release-evidence.json | Compact device records linked to the public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

The build output `bundle/` contains candidate.tgz, baseline.tgz, staging and manifest. Only **candidate.tgz** is published. The device-verified frozen tgz is hosted as the evidence Release asset and is used as the gzip fallback so CI publishes the same bytes.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/napi-build-utils-build
python3 electron-oh/tools/release.py bind --bundle /tmp/napi-build-utils-build
python3 electron-oh/tools/release.py verify --bundle /tmp/napi-build-utils-build
python3 electron-oh/tools/release.py host --bundle /tmp/napi-build-utils-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target on one HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive serial window. The device roster is the 8-case upstream-derived suite, run identically on every target.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 8/8 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 8/8 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 8/8 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 8/8 |

Platform conditions on OpenHarmony are recorded, not patched around: the library reads `package.json` from the process CWD at load time, so the demo harness seeds a minimal `package.json` into the CWD (library source unchanged). The independent Node host LD_PRELOADs a syscall fallback shim (io_uring/close_range to ENOSYS) supplied by the demo runtime, not by this package. Demos run with `--jitless`; napi-build-utils has no JIT/WASM requirement.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md), [repository releasing guide](../../../docs/RELEASING.md), and [dedicated workflow](../../../.github/workflows/napi-build-utils-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing version path verifies bytes and still verifies both `latest` and `beta` tags; a legacy `electron-oh` tag is only removed when it points at this validated candidate, and publication never recreates it. A different existing integrity or another tag target is rejected. Actual publication state is determined by npm/CI receipts, not this preparation document.
