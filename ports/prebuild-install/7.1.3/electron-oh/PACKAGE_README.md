# prebuild-install (HarmonyOS PC port)

> A command line tool to easily install prebuilt binaries for multiple versions of Node.js & Electron.

This is the [`@ohos-ports-electron/prebuild-install`](https://www.npmjs.com/package/@ohos-ports-electron/prebuild-install)
build of the upstream [`@scrypted/prebuild-install`](https://www.npmjs.com/package/@scrypted/prebuild-install)
7.1.3 package, for HarmonyOS PC (OpenHarmony aarch64). The distributed JavaScript is
byte-identical to the upstream tarball; only the npm identity/repository metadata and this
README differ. Original MIT license and authors are retained.

## Install

```sh
npm install @ohos-ports-electron/prebuild-install
```

or as a native-module install script:

```json
{
  "scripts": {
    "install": "prebuild-install || node-gyp rebuild"
  }
}
```

## What it does

`prebuild-install` computes a download URL from the platform tuple
(`platform` / `arch` / `runtime` / `abi` / `libc`), downloads a `.tar.gz` prebuild from a
GitHub release (or a configured mirror / local directory / npm cache) and unpacks it into
the module directory, so native modules do not have to compile from source.

Supported sources, in priority order:

1. local prebuild directory (`--local-prebuilds` / `<pkg>_local_prebuilds`)
2. npm cache (`npm_config_cache/_prebuilds`)
3. remote source (GitHub releases, `binary.host`, `<pkg>_binary_host[_mirror]`, `--download`)

Runtime targets include `node` (default), `napi` and `electron`. On the OpenHarmony
device the Node runtime reports `process.platform === 'openharmony'`; the tool then asks
for the `openharmony` platform tuple. Use a mirror/local source or a prebuild published
for the `openharmony-<arch>` tuple when consuming prebuilt content on device.

The command line supports `--version`, `--help`, `--force`, `--build-from-source`,
`--path`, `--token`, `--target`, `--runtime`, `--arch`, `--platform`, `--libc`,
`--download` and `--tag-prefix`.

## HarmonyOS PC notes

This package is pure JavaScript with only pure-JS runtime dependencies resolved by npm at
install time. No native build, no HAP/SDK and no lifecycle script is added by the port.
`process.platform` on device is `openharmony`, so the default tuple differs from desktop
Linux; supply the matching prebuild content source for the device tuple.

## License

MIT. See the upstream project and the retained `README.upstream.md` for full documentation.
