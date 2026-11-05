# better-sqlite3-multiple-ciphers (HarmonyOS PC / ohos-ports)

`@ohos-ports-electron/better-sqlite3-multiple-ciphers` is the HarmonyOS PC port of
[better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers)
(v13.0.4-beta.0, MIT). Upstream runtime JS, types, C++ sources and the per-platform
prebuilds are unchanged; this port adds a device-ABI prebuild for OHOS ARM64 and
a loader override used by Electron-OH hosts.

## Quick start

```sh
npm install @ohos-ports-electron/better-sqlite3-multiple-ciphers
```

On a standalone HarmonyOS PC Node (OHOS platform) the default loader resolves
`prebuilds/openharmony-arm64.node` and the library works like upstream:

```js
const Database = require('@ohos-ports-electron/better-sqlite3-multiple-ciphers');
const db = new Database(':memory:');
db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
db.prepare('INSERT INTO t (name) VALUES (?)').run('hello');
console.log(db.prepare('SELECT * FROM t').get()); // { id: 1, name: 'hello' }
db.close();
```

## Electron-OH hosts

Electron-OH does not dlopen packages inside the HAP resfile. Deploy the
Electron-ABI addon (built by the port from the same source, linked against the
Electron-oh napi shim) into the HAP native `libs` directory and point the loader
at it before requiring the package:

```js
process.env.BETTER_SQLITE3_NATIVE_BINDING = '/data/storage/el1/bundle/libs/arm64/better_sqlite3.node';
const Database = require('@ohos-ports-electron/better-sqlite3-multiple-ciphers');
```

The port's demo project ships the Electron-ABI addon as a host-supplied native
file; the npm package itself carries only the device-ABI prebuild.

## Runtime floor

This library holds Node-API persistent references to strings, which requires
**Node-API 10** (Node ≥ 22.14 / Electron-OH ≥ 37). It cannot run on Electron-OH
34 (Node 20.18.1, N-API 9). Verified device roster: 351/351 (twice) on the
standalone OHOS Node 24.13.0 and Electron-OH 37.2.0 / 40.0.1; Electron-OH 34 is
blocked by the N-API 9/10 boundary.

## License

MIT (upstream) — see the LICENSE file in the package.
