# open 11.0.4 · Electron-OH

The recipe builds `@ohos-ports-electron/open@11.0.4-electron-oh.0` from the exact public `open@11.0.4` registry tarball. It adds the same-version local HarmonyOS implementation, then applies distribution metadata. MIT licensing is preserved. The actual publication state is determined by the registry and release workflow; a built candidate alone does not mean it is published.

```sh
bash build.sh --output /tmp/open-build
python3 electron-oh/tools/release.py bind --bundle /tmp/open-build
python3 electron-oh/tools/release.py verify --bundle /tmp/open-build
python3 electron-oh/tools/release.py host --bundle /tmp/open-build
```

## Actual npm contents (12 files)

| Files | Source and role |
| --- | --- |
| index.js, index.d.ts | Patched upstream ESM public entry, types and HarmonyOS routing |
| harmony.js, harmony-ability.js | Platform dispatch, exact subprocess argv, host IPC, parameter validation and cooperative result waiting |
| harmony-host/OpenHostBridge.ets | Consumer HAP UIAbility bridge source, copied into the application's ArkTS module |
| harmony-host/open-launcher.c, harmony-host/build-launcher.mjs | Optional private HNP launcher source and explicit OHOS NDK build entry; no compiled binary ships in npm |
| package.json | Scoped identity, repository port path, original production dependencies, upstream engines >=20 and beta publication default |
| readme.md | Package integration instructions from electron-oh/PACKAGE_README.md |
| README.upstream.md | Exact original npm readme |
| license, xdg-open | Unchanged upstream license and Linux helper, retained for upstream platforms |

The full file-to-SHA256 mapping is [package-inventory.json](electron-oh/package-inventory.json). No Electron engine, Node runtime, SDK, HAP, HNP, certificate, native executable or node_modules is included in this package. The root recipe README itself is not in npm.

## Recipe files

- patchs/0001-harmony-host-bridge.patch applies to the exact registry package and adds platform implementation plus host source. patchs/0002-electron-oh-distribution.patch updates package metadata only. Ordered hashes are in inputs.lock.json.
- build.sh and electron-oh/tools/build.py download and verify the original tarball, reject unsafe archive members, apply patches, copy PACKAGE_README.md to readme.md, preserve the original readme as README.upstream.md, and create deterministic candidate.tgz plus manifest.json. These recipe files do not enter npm.
- publish.sh, tools/release.py and tools/release_channel.py validate current recipe, the exact artifact, archived device evidence, trusted main-push context, upload arguments and tags. They do not enter npm. Publication is disabled by default and uploads only the frozen tgz.
- electron-oh/tests/host-contract.mjs contains 36 explicitly simulated host bridge/protocol regressions with real host child processes. tests/package-lock.json locks test installation; it does not bundle dependencies into npm or alter consumer dependency resolution. test_release_channel.py and release-contract.py exercise publication guards. Test files do not enter npm.
- electron-oh/release-evidence.json identifies the recorded device archive by URL/SHA256 and candidate hash. CI reads original and candidate device reports; it does not execute a fresh HarmonyOS device run.

Full demos, signed deliverables, source/SDK/runtime provenance, failed attempts and reports remain in the single-library delivery project and its recorded evidence archive. Build handoff files such as manifest.json and recipe-hashes.json are CI control artifacts; only candidate.tgz is published.

See [recipe details](electron-oh/README.md), [the repository release procedure](../../../docs/RELEASING.md) and [the workflow](../../../.github/workflows/open-electron-oh.yml).
