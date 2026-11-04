# Build, validation and release conditions

The recipe locks Axios 1.21.0 registry bytes and emits one reproducible tgz:
`c46d4ab7459396994360b017bc551516c313fa8d062c970ca5324c2bc9240bf2`. A second independent package replay produced the same bytes.
Public CJS/ESM entry points, API, types and license remain intact. No functional
Axios patch was necessary for the representative tested scope.

The device suite has 35 named assertions, uses real loopback HTTP and HTTPS,
and covers requests, redirects, gzip, binary and streaming bodies, multipart,
interceptors, headers, configuration, cancellation, timeout/error handling,
TLS trust/rejection, CJS/ESM and Worker HTTP/clean exit. It is not the full
upstream suite. Reports bind package SHA256, signed HAP, engine, PID/runId,
individual expected/actual values, fixture/source hashes and dependency lock.

All launchers use --jitless. Native Undici Fetch dispatch depends on WASM and is
outside coverage. Fetch cases explicitly install the reference WASM-free
Node HTTP/HTTPS bridge in main/standalone Node and Worker, with test-only
@whatwg-node/node-fetch 0.9.3 and undici 6.29.1 Web primitives. This bridge is
not included in the npm library and does not claim native Fetch support.
External Internet connectivity, renderer XHR and complete device-side npm CLI
installation are not tested. Normal host npm install/lock is deployed to device;
upstream prepare is retained and npm's actual lifecycle policy is logged.

Electron 25 uses its original official engine and a launcher-level jitless mode
before native V8 startup, with obsolete code-memory ACLs omitted for this suite.
34/40 use corresponding official frameworks and a project-local official API
declaration overlay for this machine's API22 compiler. The native engine is not
replaced. Node is the separately executed official 24.13.0 binary with a separate
MIT sandbox syscall fallback; neither runtime helper enters the npm package.

Build once, bind recipe/commit, and pass all host compatibility jobs before
main-branch publication. Only the configured repository main push in
`npm-publish` may publish. Dedicated GitHub OIDC uses axios-electron-oh.yml,
direct publish and independent dist-tag permissions. Same-version/same-byte
publication skips upload but still checks registry tarball and both requested
tags `latest` and `beta`. A matching historical `electron-oh` tag is removed only
after beta writes succeed; conflicting versions are preserved and rejected.
The frozen tgz keeps its historical metadata and README. The explicit CLI
`--tag beta` controls current publication without repacking or changing version. Credentials
are never included in this recipe or its evidence archive.
