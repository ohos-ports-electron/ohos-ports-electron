# typeorm port build notes

## Layout

```
ports/typeorm/1.1.2/
  README.md                    this directory: identity, verified matrix, reproduction
  build.sh                     entry point -> electron-oh/tools/build.py
  publish.sh                   guarded publication -> electron-oh/tools/release.py
  electron-oh/
    inputs.lock.json           locked baseline tarball identity + candidate identity + hashes
    PACKAGE_README.md          the README shipped inside the npm tarball (readmeSha256 in lock)
    package-inventory.json     exact file -> sha256 map of the candidate tarball (2950 entries)
    release-evidence.json      per-target device evidence summary + frozen archive pointer
    tools/build.py             deterministic packer (USTAR + gzip, mtime=0, canonical OS byte)
    tools/release.py           verify / host / bind / publish actions
    tests/suite.cjs            host regression suite (runs on plain Node in CI)
    tests/release-contract.py  synthetic publication-control contract tests
```

No patches: `patchs/` is intentionally absent (the port changes only npm metadata and README).

## Deterministic build

`build.py` downloads the locked baseline (or uses `--archive`), verifies sha256 + integrity,
extracts it, replaces the upstream README with PACKAGE_README.md (upstream preserved as
README.upstream.md), rewrites package.json identity fields (name, version, description suffix,
repository, bugs), asserts the ten runtime dependency ranges and the peer contract are
unchanged, and packs USTAR + gzip deterministically (mode 0644, uid/gid 0, mtime 0, canonical
OS byte). Two consecutive builds are byte-identical; the device verification consumed exactly
the frozen bytes (sha256 39a1a771eeae0ab3cda585d07d7519f7c2c5cb96e31bbf6b7b539e5e1bc95cf6).

zlib/DEFLATE stream bytes can differ across Python/zlib builds. When a freshly packed gzip
hash differs from the lock, build.py falls back to the frozen device-tested archive bytes
(hash-checked) via `inputs.lock.json candidate.archiveUrl` and recomputes the inventory from
those bytes so the manifest always describes the artifact that is actually published.

## Verification summary

- Baseline: registry typeorm@1.1.2 (release commit a0ea553; locally rebuilt from the tag with
  pnpm@10.34.5 + tsc + gulp package reproduces the published face modulo CRLF).
- Roster: 39 applicable cases (41 authored minus two files added after the 1.1.2 release
  commit: functional/cache/db-cache-remove.test.js and unit/logger/abstract-logger.test.js)
  with 6 package-identity checkpoints folded into the first case; executed through the real
  mocha aggregation of the upstream compiled test files with better-sqlite3 driving the
  sqlite paths and the sql.js asm.js injection for the JIT-less app domain.
- Targets: independent node 24.13.0, Electron-OH 37.2.0, Electron-OH v40.0.1-release, each
  baseline+candidate with two distinct cold starts (distinct PIDs and distinct raw evidence
  bytes). electron34 is excluded as a real engines boundary (Node 20.18.1, no require(esm)).
- The full evidence (reports + raw logs) is frozen in the release archive referenced by
  release-evidence.json; the single-library project that produced it remains at the
  contributor's workspace (see the PR description).

## CI

`.github/workflows/typeorm-electron-oh.yml` builds the candidate once, binds the recipe
hashes, verifies the frozen bytes against the checked-in inventory and the release evidence
archive, runs the release contract tests, then runs the host suite on node 22.17.0 / 24.11.1 /
24.13.0 (the engines' Node versions). Publication only happens on trusted main pushes in the
npm-publish environment via npm OIDC; `latest` and `beta` are both verified after publishing.
