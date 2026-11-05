# jimp build and release

The root recipe README lists every distributed file and every recipe role.
Python build.py replays the checked baseline and rewrites package identity from
inputs.lock.json (zero functional patch port; the local adaptation's patch is a
build-time TS compile fix not present in the published dist), then emits a
deterministic tar/gzip stream. release.py checks locked bytes, inventory,
current recipe/CI commit and the archived baseline/candidate two-cold-start
device reports before publication. Normal host installation runs the real
host-safe jimp suite (package identity, unchanged `dist` hashes, PNG encode/
decode round-trip, resize/color/flip output assertions, error contracts and
font measure smoke) through the exact candidate tgz; it does not claim fresh
device execution. No simulated device result is accepted.

The npm authentication identity is package-specific: GitHub repository
ohos-ports-electron/ohos-ports-electron, workflow jimp-electron-oh.yml,
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
