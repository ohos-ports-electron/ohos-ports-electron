# vscode-oniguruma 2.0.1 Electron-OH port

The upstream registry baseline is 2.0.1; the local 2.1.0 adaptation is a method
reference whose onig.wasm is byte-identical. This recipe patches the registry
2.0.1 JavaScript and uses Binaryen 133 to translate the matching upstream WASM.
It retains native WASM where available and provides a real asm.js fallback for
jitless OpenHarmony app runtimes. User-supplied instantiators are preserved.

## npm payload

The precise 11-file payload is locked by [package-inventory.json](electron-oh/package-inventory.json):
upstream LICENSE.txt, NOTICES.txt, SECURITY.md, main.d.ts and release/onig.wasm
are unchanged; package.json changes distribution identity and repository;
release/main.js adds fallback selection and preserves the native error class;
README.md is copied from PACKAGE_README.md; README.upstream.md retains upstream
documentation; release/onig.asm.cjs is generated from the exact original WASM;
BINARYEN-LICENSE.txt accompanies the generated helper runtime. There are no
native addons, other-platform prebuilds, HAPs, SDKs or engines in this package.

## Recipe files

- patchs/0001-* changes package metadata; 0002-* patches only the distributed JS.
- build.sh invokes electron-oh/tools/build.py. It downloads and verifies the
  registry tgz and platform-specific official Binaryen archive, applies both
  patches without fuzz, converts WASM and builds deterministic candidate.tgz.
- electron-oh/inputs.lock.json pins every input, patch and candidate identity.
- electron-oh/PACKAGE_README.md and BINARYEN-LICENSE.txt are copied into npm.
- electron-oh/package-inventory.json locks every final npm member hash.
- electron-oh/tests includes the real main/Worker API assertions, their local
  reference-derived cases, a normal-install dependency lock and publication
  rejection checks. These files do not enter the npm package.
- electron-oh/tools/release.py binds the current recipe/commit, verifies frozen
  bytes and archived device reports, runs host regressions and publishes only
  from the exact trusted main-push workflow. publish.sh is disabled by default.
- electron-oh/release-evidence.json points to immutable public evidence; full
  projects and signed HAPs stay in the adaptation delivery project.

```sh
bash build.sh --output /tmp/onig-build
python3 electron-oh/tools/release.py bind --bundle /tmp/onig-build
python3 electron-oh/tools/release.py verify --bundle /tmp/onig-build
python3 electron-oh/tools/release.py host --bundle /tmp/onig-build
```

The build bundle is a handoff folder containing tooling/staging/manifests;
only its candidate.tgz is uploaded to npm. The upstream development scripts
and devDependencies are metadata, not required for installing the npm artifact.
tests/package-lock.json locks host test installation, independently of any demo.

The device matrix is independent Node plus Electron-OH 25/34/37/40, two cold
starts per original baseline/candidate and 26 named cases per run. Baseline
engine initialization fails in jitless app domains and dependent operations
are explicitly not-run. Candidate operations use the asm.js fallback. Host CI
checks native WASM and fallback on exact embedded Node versions and verifies
recorded device evidence; it does not run a fresh device job. Runtime-specific
framework changes and the Node syscall helper are outside this npm package.

See [electron-oh/README.md](electron-oh/README.md),
[release workflow](../../../../.github/workflows/vscode-oniguruma-electron-oh.yml)
and [repository release guide](../../../../docs/RELEASING.md).
Publication and website acceptance are recorded separately; recipe preparation
alone does not prove a release exists.

Measured backend detail: Electron-OH 40 exposes WebAssembly even with its jitless launch flags, and both its original baseline and candidate pass using native WASM. Node and Electron-OH 25/34/37 require the asm.js fallback. This distinction comes from the actual engine results, not a version-name assumption.
