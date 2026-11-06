# RxJS 7.8.2 Electron-OH distribution recipe

Target: `@ohos-ports-electron/rxjs@7.8.2-electron-oh.0`. The locked npm baseline is
`rxjs@7.8.2`; the local reference is the same upstream repository at 9.0.0-beta.0
with different symbol-based APIs. This port preserves stable v7 JavaScript,
types, dependencies and Apache-2.0 license. No v9 functional patch is applied.
Only package identity/repository/publish metadata and package README change.

## Actual npm content (2278 files)

This exhaustive grouping is computed from `electron-oh/package-inventory.json`,
which lists each relative path and SHA256. Original stable-v7 files are retained;
README.upstream.md preserves the original README, and the package README explains
installation, runtime conditions and limitations.

| Path or group | Files |
| --- | ---: |
| `CHANGELOG.md` | 1 |
| `CODE_OF_CONDUCT.md` | 1 |
| `LICENSE.txt` | 1 |
| `README.md` | 1 |
| `README.upstream.md` | 1 |
| `ajax/package.json` | 1 |
| `dist/bundles/` | 4 |
| `dist/cjs/` | 500 |
| `dist/esm/` | 502 |
| `dist/esm5/` | 500 |
| `dist/types/` | 500 |
| `fetch/package.json` | 1 |
| `operators/package.json` | 1 |
| `package.json` | 1 |
| `src/` | 260 |
| `testing/package.json` | 1 |
| `tsconfig.json` | 1 |
| `webSocket/package.json` | 1 |

`dist/cjs/`, `dist/esm/`, `dist/esm5/`, `dist/bundles/`, `dist/types/` contain upstream
compiled entries, maps and declarations; `src/` is matching upstream TypeScript.
There is no native addon or platform-specific binary in this pure-JavaScript tgz.
The external runtime dependency is upstream tslib ^2.1.0. Test lockfiles pin
installed dependencies; upstream devDependencies are build/test metadata and are
not runtime installation requirements. Upstream licenses and notices remain.

## Recipe content (outside npm)

`patchs/0001-*.patch` changes package.json in the staging package. `build.sh` and
`electron-oh/tools/build.py` fetch/hash the baseline, apply the patch, copy
`electron-oh/PACKAGE_README.md` to the package README, preserve its upstream copy,
and deterministically create candidate.tgz plus a manifest. `inputs.lock.json`
pins identity, baseline, patch, README and final candidate. `package-inventory.json`
pins every output member. `publish.sh`, `tools/release.py` and `release_channel.py`
verify the current checkout, recorded device evidence and trusted main CI context,
then upload this exact tgz with beta and verify latest/beta. `tests/` contains
43 functional assertions, Worker helper, locked host dependencies and publication
rejection regressions. `release-evidence.json` points to the checked archive.
The root recipe README, electron-oh/README, patches, tools, tests, evidence and
input locks do not enter npm. Only the package README template is copied in.

Python 3.12 or later is required by the build tool (CI pins 3.12).

Build handoff is a directory with candidate.tgz/manifest/commit/recipe hashes;
it is not the object uploaded to npm. Engines, HAPs, SDK, demos, build caches,
signing and authentication data stay outside this port and the library tgz.

## Reproduction and validation

```sh
bash build.sh --output /tmp/rxjs-build
python3 electron-oh/tools/release.py bind --bundle /tmp/rxjs-build
python3 electron-oh/tools/release.py verify --bundle /tmp/rxjs-build
python3 electron-oh/tools/release.py host --bundle /tmp/rxjs-build
python3 electron-oh/tests/release-contract.py
python3 electron-oh/tests/test_release_channel.py
```

Recorded device evidence covers independent Node and Electron-OH 25/34/37/40,
baseline and candidate, two cold starts each. Host CI runs the same 43 assertions
on device-observed Node versions and consumes recorded device evidence; it is
not a fresh device run. The main process retains contextIsolation, and a narrow
IPC presents actual assertions. All launchers use --jitless; RxJS needs no JIT
or WASM. DOM animationFrames, ajax/WebSocket and the complete upstream suite are
outside coverage. Full device npm CLI installation is not claimed.

See [runtime and distribution details](electron-oh/README.md),
[repository release process](../../../../docs/RELEASING.md), and
[dedicated CI](../../../../.github/workflows/rxjs-electron-oh.yml).
Actual publication status is determined from npm and the final release receipt;
the presence of this recipe alone does not prove publication.
