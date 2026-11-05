# electron-oh build & publish details

## Reproducible candidate

`tools/build.py` reproduces the frozen candidate from the locked baseline:

```sh
python3 tools/build.py --port ../.. --output /tmp/bs3mc-build \
  --archive <baseline.tgz> --device-addon <better_sqlite3.node>
```

The device-ABI addon is the cross-compiled `dist/lib/node/better_sqlite3.node`
from the OhosAgent adaptation (CMake OHOS toolchain, `NAPI_VERSION=10`,
`-O2 -flto -Bsymbolic --code-sign`). Its SHA256 is locked in
`inputs.lock.json` (`prebuiltDeviceNodeSha256`). `build.py` injects it as
`prebuilds/openharmony-arm64.node`; because npm pack is used for the tarball the
resulting bytes are identical to the frozen candidate verified on device.

If a freshly packed tgz ever differs from the locked candidate hash (gzip/zlib
platform drift), `release.py` downloads the frozen device-tested archive from
`candidate.archiveUrl` and verifies its hash before use.

## Loader adaptation

`lib/binding.js` gains (before the object branch, after the string `nativeBinding`
branch):

- `process.env.BETTER_SQLITE3_NATIVE_BINDING` override — Electron hosts set it to
  the Electron-ABI addon deployed in HAP libs.
- `'openharmony'` in `PREBUILD_PLATFORMS` — standalone OHOS Node default loader
  resolves `prebuilds/openharmony-arm64.node`.

`lib/{openharmony,ohos}-{arm64,x64}.js` mirror upstream `linux-*` static entries
(binding via env override or the prebuild). `ohos-*` exists because Electron-OH
40 reports `process.platform === 'ohos'` while 37 reports `'openharmony'`.

## Device evidence

Full per-target reports live in the single-library project
`reports/{baseline,candidate}/{node,electron34,electron37,electron40}/report.json`.
`release-evidence.json` here is the compact binding (candidate hash, two cold
starts per passing target, evidence archive URL). Electron-OH 34 candidate is
blocked (N-API 9 vs 10), see the project report for crash logs.

## Publication guard

`publish.sh` refuses to publish unless `ENABLE_ELECTRON_OH_PUBLISH=1`, the event
is a `main` push in `ohos-ports-electron/ohos-ports-electron`, and the workflow
is `better-sqlite3-multiple-ciphers-electron-oh.yml`. It verifies bytes and
`latest`/`beta` dist-tags; it never re-packs.
