# 7zip-min build and release

The root recipe README lists every distributed file and every recipe role. Python build.py replays the
checked baseline, downloads the locked published @ohos-ports-electron/7zip-bin supply, vendors it as
`node_modules/7zip-bin` (npm alias + bundledDependencies), rewrites package identity from
inputs.lock.json (zero-patch port), then emits a deterministic tar/gzip stream. release.py checks locked
bytes, inventory, current recipe/CI commit and the archived baseline/candidate two-cold-start device
reports before publication. Normal host installation runs the real host-safe 7zip-min suite (package
identity, unchanged source hashes, path7za resolution, 7za pack/unpack/list roundtrip, custom binary path
config and error contract). No simulated device result is accepted.

The npm authentication identity is package-specific: GitHub repository
ohos-ports-electron/ohos-ports-electron, workflow 7zip-min-electron-oh.yml, environment npm-publish,
branch main. Grant direct publish and independent dist-tag permissions in npm. A bootstrap manual
publication does not establish that OIDC direct publishing was exercised for that version.

Tag verification exchanges the GitHub Actions identity for a package-scoped npm token and sends an
authenticated PUT for each required tag (`latest` and `beta`), even when the value already matches. This
avoids npm CLI's matching-tag early return and proves the independent dist-tag write permission without
removing a tag or creating a test release. A legacy `electron-oh` tag is removed (fresh exchange, no
payload) only when it points at this validated candidate; publication never creates it. Credentials stay
in memory; exchange failure is fatal and cannot fall back to a local npm token. Each tag operation
receives its own fresh OIDC exchange; the exchanged identity is not reused after a successful registry
mutation.
