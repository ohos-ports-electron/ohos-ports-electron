# Reproduction and release

Build from the parent port using Python 3.12+ and patch. The recipe downloads
official Binaryen 133 for Linux x86_64 or macOS arm64, verifies its archive and
translates the exact registry onig.wasm; no local 2.1.0 JS or prebuilt asm file
is copied. --tool-archive accepts a local copy of that exact checked archive.
Both package-level replay and a second independent translation were checked.
Cross-platform replay is checked by the Linux build job against the frozen hash.

The dedicated vscode-oniguruma-electron-oh.yml builds once, shares the frozen
bundle across Node compatibility jobs and gates publication on all results.
Publish requires the exact repository, main push, workflow ref, npm-publish
environment and ENABLE_ELECTRON_OH_PUBLISH=1. A missing archive, mismatched hash,
failed candidate matrix, unknown registry error or wrong context blocks it.
An existing identical version still gets bytes and both dist-tags checked;
tags pointing at another version are never silently rolled back.

For @ohos-ports-electron/vscode-oniguruma configure GitHub Trusted Publisher:
owner/repository ohos-ports-electron/ohos-ports-electron, workflow filename
vscode-oniguruma-electron-oh.yml, environment npm-publish; allow direct npm
publish and independently allow npm dist-tag. Current npm requirements and
first-publish expiry are documented at https://docs.npmjs.com/trusted-publishers/.
First publication may need a personal browser 2FA bootstrap; record the actual
authentication method and scope, and do not treat a tag write as proof that
a future direct OIDC upload has been validated. Expected tags: latest and
beta. The registered successful main publish triggers the npm-driven
catalog refresh. The website is checked against actual registry data.
