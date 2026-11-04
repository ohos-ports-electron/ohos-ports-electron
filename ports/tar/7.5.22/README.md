# tar 7.5.22 · Electron-OH recipe

Builds **@ohos-ports-electron/tar@7.5.22-electron-oh.0** from the exact registry
baseline tar 7.5.22. All 246 distributed dist files (JavaScript, declarations and
source maps) are byte-identical to upstream. Changes are npm identity/repository
metadata and README; the original README is retained as README.upstream.md.
The original authors and BlueOak-1.0.0 LICENSE.md are retained.

## npm distribution

Candidate SHA256: `ca06a0dfed17acc4a2a5753eab8c078d03f57fea21154294e50c4b0430861fc7`.

The exact 250-file inventory and SHA256 values are in
[package-inventory.json](electron-oh/package-inventory.json):

| Group | Count | Source and role |
| --- | --- | --- |
| dist/commonjs/ | 123 | Upstream CJS implementation, declarations, maps, package type marker |
| dist/esm/ | 123 | Upstream ESM implementation, declarations, maps, package type marker |
| LICENSE.md | 1 | Upstream BlueOak-1.0.0 license |
| package.json | 1 | Upstream exports/dependencies with distribution metadata patch |
| README.md | 1 | Copied from electron-oh/PACKAGE_README.md |
| README.upstream.md | 1 | Original upstream README.md |

Runtime dependencies remain @isaacs/fs-minipass, chownr, minipass, minizlib and
yallist. Normal npm installation resolves them; the device projects retain exact
installation locks separately. There are no native addons, Windows binaries,
engines, HAPs, SDKs, tests or signing materials inside this npm package. Existing
platform branches and public API/type exports remain unchanged. Upstream
development scripts remain in package metadata; there are no preinstall,
install or postinstall scripts, and tarball publication runs no source build.

## Recipe and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| patchs/0001-electron-oh-distribution-metadata.patch | Identity/repository metadata | Applied package.json content |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Locked baseline, patch, README, candidate hashes | No |
| electron-oh/PACKAGE_README.md | Application usage/platform conditions | Copied to README.md |
| electron-oh/tools/build.py | Verify baseline, safely extract, replay, canonical tar/gzip | No |
| electron-oh/tools/release.py | Current recipe/commit, frozen bytes, evidence and CI guards | No |
| electron-oh/tests/suite.cjs / worker.cjs | Shared representative regression and real Worker | No |
| electron-oh/tests/release-contract.py | Publication rejection/permission tests | No |
| electron-oh/tests/package-lock.json | Exact host test dependency versions; candidate path rebound after hash check | No |
| electron-oh/release-evidence.json | Candidate-bound device records and archive hash | No |
| electron-oh/package-inventory.json | Exact package file hashes | No |

The build output bundle contains candidate.tgz, baseline.tgz, staging, manifest
and CI recipe/commit binding. Only **candidate.tgz** is published. The containing
bundle, project README and evidence archive are not npm packages. Publication
must use the already validated tgz, without repacking.

```sh
# Python >=3.12 and patch; select a new output per attempt.
bash build.sh --output /tmp/tar-build
python3 electron-oh/tools/release.py bind --bundle /tmp/tar-build
python3 electron-oh/tools/release.py verify --bundle /tmp/tar-build
python3 electron-oh/tools/release.py host --bundle /tmp/tar-build
```

## Recorded device verification

Baseline and candidate each passed two fresh cold starts on five actual targets,
30 assertions per start (600/600 total). The suite covers create/list/extract,
streams, gzip, append/update, filters, path handling, corruption and missing-file
errors, Header/Pax, ESM, real Worker use/exit and cleanup. Host CI reruns the same
suite on the exact recorded Node versions; it does not claim fresh device runs.

| Target | Reported Electron | Node | Candidate cold starts |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 x 30/30 |
| electron25 | 25.3.2 | 18.15.0 | 2 x 30/30 |
| electron34 | v34.8.6-release | 20.18.1 | 2 x 30/30 |
| electron37 | 37.2.0 | 22.17.0 | 2 x 30/30 |
| electron40 | v40.0.1-release | 24.11.1 | 2 x 30/30 |

Use writable sandbox paths. Native symlink/hardlink restrictions are retained;
the suite checks actual native capability and tar extraction warnings. It does
not substitute a normal file to claim links work. Privileged ownership, Windows,
large archives, stress, JIT/WASM and the complete upstream roster are outside
this representative suite.

Demo conditions: --jitless, since tar requires no JIT/WASM. 25 receives it before
V8 initialization and omits the unavailable legacy code-memory ACL. 34/40 use an
isolated overlay of locked official API declarations over the installed API22
compiler; the actual device is API26. The overlay does not replace engine bytes
or validate unrelated print/power/notification APIs. The vendor main.js entry
and 40 executable helper deployment are preserved. Independent Node uses the
exact official engine with a separately documented MIT syscall fallback. These
are verification runtime conditions, not package patches or package contents.

## Publication

See [package instructions](electron-oh/PACKAGE_README.md),
[recipe details](electron-oh/README.md),
[releasing guide](../../../docs/RELEASING.md), and
[workflow](../../../.github/workflows/tar-electron-oh.yml).

Publication is disabled by default. Only a trusted main push to the exact
repository/workflow in npm-publish can publish. Existing identical bytes are
checked and both latest and beta tags are still verified. Different
existing bytes or tags pointing at another release are rejected. Actual online
publication is established by registry/CI receipts, not this build recipe.
