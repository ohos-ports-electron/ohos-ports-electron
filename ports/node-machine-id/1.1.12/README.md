# node-machine-id 1.1.12 for Electron-OH

Builds `@ohos-ports-electron/node-machine-id@1.1.12-electron-oh.0` from the SHA256/SHA512-locked published `@ohos-ports/node-machine-id@1.1.12-beta.0` baseline. `patchs/` changes only HarmonyOS routing, shell-free file access, atomic installation ID persistence, and distribution metadata. MIT copyright and public API/types are retained. Non-HarmonyOS uses the unchanged original UMD bundle.

```sh
bash build.sh --output /tmp/node-machine-id-bundle
python3 electron-oh/tools/release.py bind --bundle /tmp/node-machine-id-bundle
python3 electron-oh/tools/release.py verify --bundle /tmp/node-machine-id-bundle
python3 electron-oh/tools/release.py host --bundle /tmp/node-machine-id-bundle
```

The build is deterministic with Python >=3.12, patch, and registry access. Host tests use installed candidate files; platform/failure injection is labeled and separate from recorded device validation. Release evidence binds the exact candidate to independent DevNode-OH and Electron-OH 25/34/37/40, two fresh PIDs per target. CI verifies recorded evidence and runs exact observed Node versions; it does not run fresh device tests. Full demos/HAP/runtime inputs stay in the external single-library project/evidence archive, outside this minimal recipe.

Publishing runs only for trusted main pushes in environment npm-publish, after build and all compatibility jobs. It uploads the exact tgz using beta, verifies registry bytes and independently authenticated latest/beta tag writes, and refreshes the public package catalog. Old electron-oh tags are not written or removed. A same-version byte conflict is refused. Candidate contents and usage limits are in [PACKAGE_README.md](electron-oh/PACKAGE_README.md).
