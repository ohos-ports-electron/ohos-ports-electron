# Axios 1.21.0 Electron-OH distribution recipe

Publishes `@ohos-ports-electron/axios@1.21.0-electron-oh.0` from the exact npm Axios 1.21.0 registry
archive. The distributed JavaScript, types, licenses, public API and production
dependencies remain upstream. One patch changes package identity/repository/
publish metadata; a distribution README is added and the upstream README kept.
Local reference source contains later upstream changes and is not copied over
the registry baseline. This is a pure JavaScript library, with no native addon.

## Exact npm content

The frozen package contains **93 files**, enumerated with SHA256 in
[`electron-oh/package-inventory.json`](electron-oh/package-inventory.json):

- Root files (9): `CHANGELOG.md`, `LICENSE`, `MIGRATION_GUIDE.md`, `README.md`, `README.upstream.md`, `index.d.cts`, `index.d.ts`, `index.js`, `package.json`.
- `lib/` (76): unchanged upstream ESM source, adapters, helpers,
  platform classes and core request/response implementation.
- `dist/` (8): unchanged upstream Node/browser CJS, UMD, ESM,
  minified browser bundles and source maps, including retained browser files.

There are no runtime engines, HAPs, SDKs, signing files, fixtures, test Fetch
bridge, Node syscall helpers, build tools or this recipe README in the npm tgz.
The new package README is copied from `electron-oh/PACKAGE_README.md`; upstream
`README.md` is preserved as `README.upstream.md`. No other file is added.

## Recipe files and responsibilities

- `patchs/0001-electron-oh-distribution-metadata.patch`: package.json-only patch;
  does not itself enter the tgz.
- `build.sh`, `electron-oh/tools/build.py`: checked baseline download, safe
  extraction, ordered patch replay and deterministic candidate pack. Not packaged.
- `publish.sh`, `electron-oh/tools/release.py`: default-disabled publication,
  current recipe/artifact identity, archived device gate, host regression, npm
  exact-byte and tag checks. Not packaged.
- `electron-oh/inputs.lock.json`: input hash/integrity, ordered patches, README
  hash, candidate identity/hash/integrity, repository and requested dist-tags.
- `electron-oh/PACKAGE_README.md`: copied into package/README.md.
- `electron-oh/package-inventory.json`: exact tar member hashes. Not packaged.
- `electron-oh/tests/`: representative API suite, Worker, explicit WASM-free
  Fetch bridge, locked test dependencies, synthetic release rejection checks and
  intentionally public self-signed localhost TLS test fixtures. Not packaged.
- `electron-oh/release-evidence.json`: five-target recorded device report hashes
  and public evidence archive URL/hash. Not packaged.
- `electron-oh/README.md`: reproduction and runtime conditions. Not packaged.

`candidate.tgz` alone is the npm upload object. The build bundle also includes
baseline/staging/manifest and recipe binding files; it is not an npm package.
The test lock includes pinned test-only Fetch dependencies in addition to Axios
production dependencies; it is not a replacement for the package dependency
metadata. Normal production install remains npm's upstream dependency resolution.

## Reproduce

```sh
bash build.sh --output /tmp/axios-frozen-build
python3 electron-oh/tools/release.py bind --bundle /tmp/axios-frozen-build
python3 electron-oh/tools/release.py verify --bundle /tmp/axios-frozen-build
python3 electron-oh/tools/release.py host --bundle /tmp/axios-frozen-build
python3 electron-oh/tests/release-contract.py
```

The final candidate SHA256 is `c46d4ab7459396994360b017bc551516c313fa8d062c970ca5324c2bc9240bf2`. Each baseline and candidate was
installed and executed in two independent cold starts on standalone HarmonyOS
Node and Electron-OH 25/34/37/40: 35 assertions per start, 700 total. Host CI
replays assertions on the exact Node versions measured there and consumes the
recorded device evidence; it does not claim a fresh device runner.

The active release channels are `latest` and `beta`, following repository policy.
CI explicitly publishes with `--tag beta` and removes the legacy `electron-oh`
tag only when it points to this exact verified version. The frozen patch and
package README retain their historical tag to reproduce the same tested bytes;
install the current channel with `npm install @ohos-ports-electron/axios@beta`. See
[`electron-oh/README.md`](electron-oh/README.md),
[`docs/RELEASING.md`](../../../docs/RELEASING.md) and
[`axios-electron-oh.yml`](../../../.github/workflows/axios-electron-oh.yml).
Actual publication status is determined by registry/CI and the project receipts,
not by the existence of this recipe.
