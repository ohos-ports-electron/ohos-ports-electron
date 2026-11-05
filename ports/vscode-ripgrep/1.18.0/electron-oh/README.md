# Build and release contract

The candidate is reconstructed from exactly locked npm wrapper and native
packages. Two unified patches have package input scope. The native ELF is
unchanged, static aarch64 musl, with original MIT notices retained.

For HarmonyOS arm64 the wrapper uses the bundled executable, or the absolute
VSCODE_RIPGREP_PATH set before ESM import when a consumer deploys its bytes in
a private HNP. App resource paths are not executable. The public rgPath is
what the device tests execute; the harness does not substitute its own path.
The Node demo puts Node and rg in one private HNP; Electron demos put rg in a
private HNP beside the native vendor Electron framework. Nested ZIP entries
are verified as nested entries, not as plain HAP aliases.

A dedicated GitHub-hosted workflow builds once and binds its exact checkout,
runs all five measured Node versions as host regression, then publishes only
on a trusted push to main. PR/fork/dispatch and other branches cannot upload.
The npm-publish environment is restricted to main. npm OIDC permissions must
allow both direct publication and independent dist-tag maintenance. First
package creation/authentication and later OIDC validation are reported apart.

The shared release_channel.py applies the current beta policy to active input
locks, the actual npm publish argv and every tag write. latest and beta are
both read back after upload or same-byte skip. Historical electron-oh tags
are not modified by this port. Website data and the beta install entry are
verified independently after Pages deploys. Do not repack to change tags.

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
