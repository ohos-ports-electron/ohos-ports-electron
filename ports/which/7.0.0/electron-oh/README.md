# which build and release

The root recipe README lists every distributed file and every recipe role.
Python build.py replays the checked baseline and rewrites package identity from
inputs.lock.json (zero-patch port), then emits a deterministic tar/gzip stream.
The upstream bin entry (`node-which` -> `./bin/which.js`) is preserved and the
CLI file keeps its executable mode. release.py checks locked bytes, inventory,
current recipe/CI commit and the archived baseline/candidate two-cold-start
device reports before publication. Normal host installation runs the real
27-case host-safe which suite (PATH lookups, all/nothrow/path options,
relative-path forms, error contracts, CLI usage/exit-code behavior plus
package identity and unchanged-lib hashes; the six CLI cases that depend on
device-only PATH fixtures such as `tap` are not claimed on host).
No simulated device result is accepted.

The npm authentication identity is package-specific: GitHub repository
ohos-ports-electron/ohos-ports-electron, workflow which-electron-oh.yml,
environment npm-publish, branch main. Grant direct publish and independent
dist-tag permissions in npm. A bootstrap manual publication does not establish
that OIDC direct publishing was exercised for that version.

Tag verification exchanges the GitHub Actions identity for a package-scoped
npm token and sends an authenticated PUT for each required tag (`latest` and
`beta`), even when the value already matches. This avoids npm CLI's
matching-tag early return and proves the independent dist-tag write permission
without removing a tag or creating a test release. A legacy `electron-oh` tag
is removed (fresh exchange, no payload) only when it points at this validated
candidate; publication never creates it. Credentials stay in memory; exchange
failure is fatal and cannot fall back to a local npm token. Each tag operation
receives its own fresh OIDC exchange; the exchanged identity is not reused
after a successful registry mutation.
