# typeorm 1.1.2 (Electron-OH port)

OpenHarmony Node / Electron-OH port of [typeorm](https://github.com/typeorm/typeorm) 1.1.2,
published as `@ohos-ports-electron/typeorm@1.1.2-electron-oh.0` on the `latest` and `beta`
channels of npm. The port is zero-patch: the JavaScript is byte-identical to the registry
baseline `typeorm@1.1.2` (upstream release commit a0ea553); only the npm identity, repository
metadata and README change (the upstream readme is preserved as README.upstream.md).

## Verified matrix

One frozen tarball, two cold starts per target, 39 upstream-derived roster cases plus six
package-identity checkpoints folded into the first case (the tooling roster contract):

| target | engine | baseline | candidate |
| --- | --- | --- | --- |
| independent Node | node 24.13.0 | 39/39 x2 | 39/39 x2 |
| Electron-OH 37 | 37.2.0 (node 22.17.0) | 39/39 x2 | 39/39 x2 |
| Electron-OH 40 | v40.0.1-release (node 24.11.1) | 39/39 x2 | 39/39 x2 |

electron34 is intentionally outside the matrix: typeorm 1.1.2 declares engines
`^20.19.0 || ^22.13.0 || >=24.11.0` (20.19.0 is the Node require(esm) backport) and Electron 34
bundles Node 20.18.x, so the ESM-only runtime dependencies (ansis, tinyglobby, yargs and their
chains) cannot load; the boundary was device-measured (ERR_REQUIRE_ESM at suite-load). This is
an upstream runtime requirement, not a port defect.

Database drivers keep the upstream optional peerDependencies contract and lazy loading:
better-sqlite3 is verified with the OpenHarmony arm64 build (13.0.3 dual ABI), sql.js runs via
the official asm.js build under the JIT-less app domain (injected by the demo suite, not a
package patch), ioredis is verified in its degraded mode, and Oracle/SAP HANA need closed
drivers without OpenHarmony builds (out of scope; not installing them does not affect the
other drivers).

## Files

- `build.sh` / `publish.sh` - entry points (deterministic build; guarded publication)
- `electron-oh/inputs.lock.json` - locked baseline and candidate identity
- `electron-oh/tools/build.py` - deterministic USTAR+gzip packer (zero patches)
- `electron-oh/tools/release.py` - frozen-byte verification, host regression, guarded publish
- `electron-oh/tests/suite.cjs` - host regression suite (CI compatibility job)
- `electron-oh/tests/release-contract.py` - publication-control contract tests
- `electron-oh/package-inventory.json` - exact 2950-file candidate inventory
- `electron-oh/release-evidence.json` - frozen device-evidence index and archive pointer
- `electron-oh/PACKAGE_README.md` - the README shipped inside the npm tarball
- `electron-oh/README.md` - build and reproduction notes

The device evidence archive is published at
https://github.com/ohos-ports-electron/ohos-ports-electron/releases/tag/typeorm-evidence-1.1.2-electron-oh.0
(sha256 recorded in release-evidence.json). Host CI does not run a fresh HarmonyOS device job;
the compatibility matrix runs the host suite on the engines' Node versions (22.17.0 / 24.11.1
/ 24.13.0, matching the verified devices).

## Reproducing

```sh
bash build.sh --output <bundle> --archive <baseline.tgz>
python3 electron-oh/tools/release.py bind --bundle <bundle>
python3 electron-oh/tools/release.py verify --bundle <bundle>
python3 electron-oh/tests/release-contract.py
python3 electron-oh/tools/release.py host --bundle <bundle>
```

See `electron-oh/README.md` and the repo-level `docs/RELEASING.md` for the publication flow
(`latest` + `beta` dist-tags via npm Trusted Publishing on main pushes only).
