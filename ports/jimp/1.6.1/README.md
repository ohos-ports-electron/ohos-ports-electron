# jimp 1.6.1 · Electron-OH recipe

Builds **@ohos-ports-electron/jimp@1.6.1-electron-oh.0** from the locked upstream jimp 1.6.1 registry tarball.
jimp is a pure-JavaScript image processing library; all runtime files in the npm package are byte-identical
to upstream (zero functional patch). Changes are npm identity/repository metadata, the description suffix
and the README; the upstream README is preserved as `README.upstream.md`. The MIT LICENSE and all
`@jimp/*@1.6.1` pure-JS runtime dependencies (resolved from the public npm registry at install time) are
retained unchanged.

## npm distribution

The package contains 32 files; the exact paths and SHA256 values are in [package-inventory.json](electron-oh/package-inventory.json).

- `LICENSE`
- `README.md`
- `README.upstream.md`
- `package.json`
- `dist/browser/`, `dist/commonjs/`, `dist/esm/` (built JS, source maps, `.d.ts` and subpath `package.json`)

jimp depends on 27 pure-JS `@jimp/*@1.6.1` packages and their transitive pure-JS closure, all resolved by
npm at install time; nothing is vendored into this tarball. There are no native addons, HAPs, SDKs,
signing keys or lifecycle scripts in this npm package. Existing platform behavior and public APIs are retained.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host jimp suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero functional patch** (`patchs/` stays empty): package.json identity/repository changes
are applied by build.py directly from inputs.lock.json, mirroring the upstream metadata rewrite. The local
adapted library's `0001` patch is a build-time tshy strict-null compile fix that only affects building from
source; the published npm dist already contains the identical compiled output, so it is not needed here.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging, manifest and CI
recipe/commit binding files. Only **candidate.tgz** is published. Do not publish the containing bundle or
re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/jimp-build
python3 electron-oh/tools/release.py bind --bundle /tmp/jimp-build
python3 electron-oh/tools/release.py verify --bundle /tmp/jimp-build
python3 electron-oh/tools/release.py host --bundle /tmp/jimp-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts per target on one
HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive serial window. The device roster is
the 45-case functional suite (F-01-01..F-07-03) shared by every target: image load (file/buffer/URL),
export (png/jpeg/bmp/gif/tiff/base64), pixel/scan/clone/composite, geometry, color, text and
hash/diff analysis. Host CI separately replays a host-safe subset of the same assertions; it does not claim
fresh device execution.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × 45/45 |
| electron34 | v34.8.6-release | 20.18.1 | 2 × 45/45 |
| electron37 | 37.2.0 | 22.17.0 | 2 × 45/45 |
| electron40 | v40.0.1-release | 24.11.1 | 2 × 45/45 |

Platform conditions on OpenHarmony are recorded, not patched around: `process.platform` is `openharmony`,
so the pure-JS jimp API executes under that platform semantics with no native addons involved. Demos run
with `--jitless` (app-domain W^X); jimp has no JIT/WASM requirement, so the full roster is exercised under
this mode. The URL-read case (F-01-03) uses a `node:http` fetch runtime shim installed by the suite when
WebAssembly is unavailable under `--jitless`, served through `hdc rport tcp:8899 tcp:8899` to a host mock;
test fixtures ship inside `node_modules/@jimp/core/fixtures` (the HNP payload only assembles node_modules).
These are demo-runtime provisions, not package contents.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md), [recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and the dedicated workflow
`../../.github/workflows/jimp-electron-oh.yml`.

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity. The existing
version path verifies bytes and still verifies both latest and beta tags; a legacy electron-oh tag is only
removed when it points at this validated candidate, and publication never recreates it. A different existing
integrity or another tag target is rejected. Actual publication state is determined by npm/CI receipts, not
this preparation document.
