# xterm-addon-clipboard 0.2.0 · Electron-OH recipe

Builds **@ohos-ports-electron/xterm-addon-clipboard@0.2.0-electron-oh.0** from the
locked upstream `@xterm/addon-clipboard` 0.2.0 registry tarball. All distributed
JavaScript files (`lib/addon-clipboard.js`, `lib/addon-clipboard.mjs`, source maps,
type declarations, `src/ClipboardAddon.ts`) are byte-identical to upstream; this port is
zero-patch. Changes are npm identity/repository metadata and the README; the original
readme is preserved as `README.upstream.md`. MIT license and original authors are
retained. The single runtime dependency `js-base64@^3.7.5` keeps resolving through npm
at install time and is not vendored.

## npm distribution

Candidate SHA256 is recorded in [inputs.lock.json](electron-oh/inputs.lock.json) and
re-verified against device evidence. The package re-ships the 9 upstream files plus
`README.upstream.md`; the exact paths and SHA256 values are in
[package-inventory.json](electron-oh/package-inventory.json).

xterm-addon-clipboard is pure JavaScript. There are no engines, HAPs, SDKs, tests,
signing keys or lifecycle scripts in this npm package. Existing platform behavior and
public APIs are retained. The `@xterm/xterm` import in the shipped type declarations is
types-only; the addon has no runtime dependency on `@xterm/xterm` and works with any
terminal exposing `parser.registerOscHandler` and `input`.

## Recipe files and build artifact

| File | Role | In npm tgz |
| --- | --- | --- |
| README.md | This recipe explanation | No |
| build.sh / publish.sh | Build and guarded publication entry points | No |
| electron-oh/inputs.lock.json | Baseline and candidate hashes, repository identity | No |
| electron-oh/PACKAGE_README.md | User-facing package/platform documentation | Copied to README.md |
| electron-oh/tools/build.py | Safe extraction, metadata rewrite and canonical npm tarball | No |
| electron-oh/tools/release.py | Frozen artifact, current recipe, device evidence and publication checks | No |
| electron-oh/tests/ | Host addon-clipboard suite and publication rejection tests | No |
| electron-oh/release-evidence.json | Compact records linked to checked public evidence archive | No |
| electron-oh/package-inventory.json | Every npm file/hash | No |

This port is **zero-patch** (`patchs/` stays empty): package.json identity/repository
changes are applied by build.py directly from inputs.lock.json.

The build output `bundle/` contains candidate.tgz, original baseline.tgz, staging,
manifest and CI recipe/commit binding files. Only **candidate.tgz** is published. Do not
publish the containing bundle or re-pack during publication.

```sh
# Python >=3.12 required. Use a new output directory per attempt.
bash build.sh --output /tmp/xterm-addon-clipboard-build
python3 electron-oh/tools/release.py bind --bundle /tmp/xterm-addon-clipboard-build
python3 electron-oh/tools/release.py verify --bundle /tmp/xterm-addon-clipboard-build
python3 electron-oh/tools/release.py host --bundle /tmp/xterm-addon-clipboard-build
```

## Recorded device verification

The original registry tarball and this exact candidate each passed two fresh cold starts
per target on one HAD-W32 device (OpenHarmony 7.0.0.109, API 26, aarch64) in an exclusive
serial window. The device roster exercises the 0.2.0 public API: Base64 encode/decode
round-trips (including invalid-input rejection), ClipboardAddon OSC 52 copy (`pc;data`),
OSC 52 query/report (`pc;?`) with an injected in-memory `IClipboardProvider`, PRIMARY vs
SYSTEM selection routing, and `dispose()` unregistering the OSC 52 handler. The addon
runs on both the independent Node and the Electron-OH hosts using `@xterm/headless`
Terminal; the electron-oh renderer additionally exercises the default
`BrowserClipboardProvider` against the real Clipboard API. Host CI separately replays the
host-safe subset of the same assertions; it does not claim fresh device execution.

| Target | Reported Electron | Node | Device roster |
| --- | --- | --- | --- |
| node | independent Node | 24.13.0 | 2 × roster |
| electron34 | v34.8.6-release | 20.18.1 | 2 × roster |
| electron37 | 37.2.0 | 22.17.0 | 2 × roster |
| electron40 | v40.0.1-release | 24.11.1 | 2 × roster |

The independent Node host runs `--jitless` (the addon is pure JS with no JIT/WASM
requirement) and LD_PRELOADs a syscall fallback shim (io_uring/close_range to ENOSYS)
supplied by the demo runtime, not by this package.

## Publication

See [package/platform instructions](electron-oh/PACKAGE_README.md),
[recipe details](electron-oh/README.md),
[repository releasing guide](../../../docs/RELEASING.md), and
[dedicated workflow](../../../.github/workflows/xterm-addon-clipboard-electron-oh.yml).

Publication is disabled by default. The dedicated workflow permits only main push in
ohos-ports-electron/ohos-ports-electron with npm-publish and the exact workflow identity.
The existing version path verifies bytes and still verifies both latest and beta tags. A
different existing integrity or another tag target is rejected. Actual publication state
is determined by npm/CI receipts, not this preparation document.
