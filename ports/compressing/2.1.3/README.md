# compressing 2.1.3 · Electron-OH recipe

Builds **@ohos-ports-electron/compressing@2.1.3-electron-oh.0** from the locked upstream compressing 2.1.3 registry tarball.
All 21 distributed JavaScript files (index.js, index.d.ts, 18 lib/ modules) are byte-identical to upstream; this port is zero-patch. Changes are npm identity/repository metadata and the README; the original README is preserved as README.upstream.md. MIT LICENSE and original authors are retained.

## npm distribution

Candidate SHA256: `e5d9acf20c887c427d962d03140b8655420d94f9e38d1a840e3881c6157f31f1`.
The package contains 24 files: 21 upstream JavaScript/typing files, LICENSE, package.json, the package README and upstream README. The exact paths and SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

- `LICENSE`
- `README.md`
- `README.upstream.md`
- `index.js`
- `index.d.ts`
- `lib/base_stream.js`, `lib/base_write_stream.js`, `lib/utils.js`
- `lib/gzip/{file_stream,index,uncompress_stream}.js`
- `lib/tar/{file_stream,index,stream,uncompress_stream}.js`
- `lib/tgz/{file_stream,index,stream,uncompress_stream}.js`
- `lib/zip/{file_stream,index,stream,uncompress_stream}.js`
- `package.json`

compressing has seven pure-JS runtime dependencies (tar-stream 1.6.2, yauzl, yazl, iconv-lite, get-ready, flushwritable, streamifier) resolved by npm at install time; they are not vendored into the tarball. There are no engines, HAPs, SDKs, tests, signing keys or lifecycle scripts in this npm package. Existing platform behavior and public APIs are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host compressing suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero-patch** (`patchs/` stays empty): package.json identity/repository changes are applied by build.py directly from inputs.lock.json, mirroring the upstream metadata rewrite.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging, manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/compressing-build
python3 electron-oh/tools/release.py bind --bundle /tmp/compressing-build
python3 electron-oh/tools/release.py verify --bundle /tmp/compressing-build
python3 electron-oh/tools/release.py host --bundle /tmp/compressing-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target on one HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive serial window. The device roster is the same 178-case suite on every target (upstream `test/` full port plus 7 backfilled generated cases), driven by the real compressing API. Host CI separately replays the host-safe subset of the same assertions; it does not claim fresh device execution.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 178/178 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 178/178 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 178/178 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 178/178 |

Platform conditions on OpenHarmony are recorded, not patched around: the app-domain sandbox disallows `symlink()` (EACCES), so archives with real symlink entries finish with a deterministic error, entries whose symlink target escapes the destination are skipped with a warning, and traversal entry names are normalized inside the destination directory; HMDFS masks the other-read permission bit and `chmod()` is ineffective, so exact `mode` equality is asserted under masked semantics. The independent Node host LD_PRELOADs a syscall fallback shim (io_uring/close_range to ENOSYS) supplied by the demo runtime, not by this package. Demos run with `--jitless`; compressing is pure JS with no JIT/WASM requirement. The device dependency closure resolves `tar-stream@1.6.2` (`^1.5.2` resolves to 1.6.2 on any fresh install; 1.5.5 hangs on Node 24 `TarFileStream` packing paths).

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md), [repository releasing guide](../../../docs/RELEASING.md), and [dedicated workflow](../../../.github/workflows/compressing-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing version path verifies bytes and still verifies both latest and beta tags. A different existing integrity or another tag target is rejected. Actual publication state is determined by npm/CI receipts, not this preparation document.
