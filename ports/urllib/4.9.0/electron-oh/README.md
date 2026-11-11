# urllib 4.9.0-electron-oh.0 · build and release

The root README lists every distributed file and every recipe role. Python build.py replays the checked
baseline (urllib 4.9.0), downloads the locked undici 7.30.2 supply, injects the JsParser HTTP/1 parser
(apply-undici-js-parser.cjs), vendors it as `node_modules/undici` (`bundledDependencies: ["undici"]`),
rewrites package identity from inputs.lock.json and emits a deterministic tar/gzip stream. release.py
checks locked bytes, inventory, current recipe/CI commit and the archived baseline/candidate two-cold-start
device reports before publication. Normal host installation runs the real host-safe urllib suite (package
identity, unchanged source hashes, network contract across options.*, and diagnostics channels) under
`--jitless` (matching the app-domain constraint). No simulated device result is accepted.

The npm authentication identity is package-specific: GitHub repository
ohos-ports-electron/ohos-ports-electron, workflow urllib-electron-oh.yml, environment npm-publish,
branch main. Grant direct publish and independent dist-tag permissions in npm. A bootstrap manual
publication does not establish that OIDC direct publishing was exercised for that version.

Tag verification exchanges the GitHub Actions identity for a package-scoped npm token and sends an
authenticated PUT for each required tag (`latest` and `beta`), even when the value already matches. This
avoids npm CLI's matching-tag early return and proves the independent dist-tag write permission without
removing a tag or creating a test release. A legacy `electron-oh` tag is removed (fresh exchange, no
payload) only when it points at this validated candidate; publication never creates it. Credentials stay
in memory; exchange failure is fatal and cannot fall back to a local npm token.

The device evidence archive (`urllib-4.9.0-electron-oh.0-device-evidence.tar.gz`, see release-evidence.json)
records the eight per-target/phase device reports; it is published as a GitHub Release asset named
`urllib-evidence-4.9.0-electron-oh.0` before the main push so CI `release.py verify` can download and check
it. For local (offline) verification set `EVIDENCE_ARCHIVE_LOCAL=/abs/device-evidence.tar.gz`.
