# vscode-ripgrep 1.18.0 → Electron-OH

Candidate: `@ohos-ports-electron/vscode-ripgrep@1.18.0-electron-oh.0`.
Frozen tgz SHA256: `a5e35cccc67aaf63dbb37fdbb230cc4e5e5f1f18bfdfff58b45d86cbc4cd0736`.

Baseline: `@vscode/ripgrep@1.18.0`. This port preserves its `rgPath` ESM API.
`binPathFor` belongs to the separate `@vscode/ripgrep-universal` package and is
outside this package. Original input comparison and implementation selection
remain in the single-library provenance records.

## Actual npm package contents (10 files)

- `LICENSE` — license / third-party provenance
- `README.md` — package usage documentation
- `README.upstream.md` — upstream documentation preserved
- `THIRD_PARTY_NOTICES.md` — license / third-party provenance
- `bin/ohos-arm64/rg` — unchanged upstream native executable
- `lib/index.d.ts` — upstream type declaration
- `lib/index.js` — OHOS path routing with upstream non-OH routes retained
- `licenses/ripgrep-LICENSE-MIT` — license / third-party provenance
- `licenses/vscode-ripgrep-native-LICENSE` — license / third-party provenance
- `package.json` — distribution metadata

The archive is built from the locked 5-file upstream JS tarball and matching
`@vscode/ripgrep-linux-arm64@1.18.0` tarball. The original JS types and wrapper
license are retained. The native binary matches the local reference and
Microsoft's exact v15.0.1 prebuilt release archive; its actual device output is
`ripgrep 15.0.0`. Source configuration selects core tag 15.0.0 plus the BinSkim
patch. No new Rust/native compilation is claimed.

## Recipe files and their relation to the npm package

| File | Responsibility / enters npm? |
|---|---|
| `patchs/0001-ohos-binary-path.patch` | Rewrites packaged lib/index.js; patch itself stays out |
| `patchs/0002-distribution-metadata.patch` | Rewrites package.json; patch itself stays out |
| `build.sh`, `electron-oh/tools/build.py` | Verify two pinned tgz inputs, apply exact patches, assemble deterministic candidate; stay out |
| `publish.sh`, `electron-oh/tools/release.py` | Disabled by default; bind/verify current checkout, archived device evidence and one frozen build; stay out |
| `electron-oh/tools/release_channel.py` | Shared beta policy gate for configs, upload argv, tag writes and final registry/catalog; stays out |
| `electron-oh/inputs.lock.json` | Baseline/native integrity, patches, license, identity and beta strategy; stays out |
| `electron-oh/PACKAGE_README.md` | Copies to package/README.md; original becomes README.upstream.md |
| `electron-oh/THIRD_PARTY_NOTICES.md` | Copies unchanged to package root |
| `electron-oh/RIPGREP-LICENSE-MIT` | Copies to licenses/ripgrep-LICENSE-MIT |
| `electron-oh/native-provenance.json` | Official release/source relationship and unchanged native artifact fingerprint; stays out |
| `electron-oh/package-inventory.json` | Exact npm file SHA256 map, checked at build handoff and publish; stays out |
| `electron-oh/tests/host.cjs`, `package-lock.json` | Real host optional native route/search/Worker plus explicitly simulated OHOS routing; stay out |
| `electron-oh/tests/test_release_channel.py`, `release-contract.py` | Negative release and channel tests; stay out |
| `electron-oh/release-evidence.json` | Binds candidate, two device starts per target and public evidence archive; stays out |
| This README and `electron-oh/README.md` | Explain the contribution; neither enters npm |

Other platforms retain the twelve exact upstream optional dependency versions.
Their Windows/macOS/Linux binaries are separate upstream npm packages, not
files hidden in this archive. The test lock describes host regression installs;
it is distinct from a consumer's normal installation and the recipe input lock.

## Reproduce and publish

```sh
bash build.sh --output /absolute/new/bundle
python3 electron-oh/tools/release.py bind --bundle /absolute/new/bundle
python3 electron-oh/tools/release.py verify --bundle /absolute/new/bundle
python3 electron-oh/tools/release.py host --bundle /absolute/new/bundle
PYTHONPATH=electron-oh/tools python3 electron-oh/tests/test_release_channel.py
python3 electron-oh/tests/release-contract.py
```

The bundle contains baseline/native archives, a staging tree, manifest.json and
**candidate.tgz**; only that exact candidate tgz is uploaded. Engines, SDKs,
complete demos, HAPs, caches and signing/authentication materials are outside
both npm and this contribution. Full five-target projects and reports remain
in the local single-library delivery project.

The recorded candidate matrix is two cold starts × 24 assertions × five targets
(independent HarmonyOS Node and Electron-OH 25/34/37/40). The original module
fails library loading on OHOS platform names; dependent searches are not-run.
The candidate calls its exported rgPath, including in Worker, using exact
private-HNP binary bytes. `--jitless` is recorded; no JIT/WASM dependency.
Device-side complete npm CLI installation and the full ripgrep upstream roster
are not claimed. CI separately executes host regressions and checks archived
real device evidence; it has no fresh device runner.

Workflow: [vscode-ripgrep-electron-oh.yml](../../../.github/workflows/vscode-ripgrep-electron-oh.yml).
Release policy: [docs/RELEASING.md](../../../docs/RELEASING.md).
Details: [electron-oh/README.md](electron-oh/README.md).
Publication state is verified separately in the single-library release receipts;
a local ready recipe alone does not claim npm has published.

Electron-OH 40: the measured vendor engine stalls synchronous spawnSync child
reaping. Passing device coverage uses asynchronous child_process.spawn in
main/Node and Worker. Synchronous execution on that engine is not supported
by this validation. Earlier synchronous attempts and exact engine hash are
retained; the npm package bytes did not change for this harness adjustment.

Electron-OH 40 Worker subprocesses additionally use shared runtime adapter
`electron40-child-reaper-3afb8387`. It is guarded by engine SHA256
`3afb83871ad71c991003873925bd40d0cebb27e13fbd1844070cc221b9e6de46` and
uses `napi_get_uv_event_loop` / `uv__wait_children` from that exact ELF, rather
than globally interposed ArkTS symbols. Real waitpid status and process cleanup
are retained. The source, matching Node 24.11.1 API headers, compiler receipt
and helper fingerprint are in the recorded evidence archive. The signed HAP
includes the helper; the npm library does not. The vendor engine itself is
unchanged. Full demo builds read the shared local runtime-fix source directory;
it can be reconstructed from reports/environment/runtime-fixes using build.py
and the exact supplied vendor engine. Other targets do not use this adapter.
