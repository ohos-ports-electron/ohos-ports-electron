# @ohos-ports-electron/conf

OpenHarmony distribution of conf 16.0.0 (MIT). Original upstream README is
preserved as README.upstream.md. Public ESM API, types and licenses are retained.

```sh
npm install @ohos-ports-electron/conf@electron-oh
```

```js
import Conf from '@ohos-ports-electron/conf';
const config = new Conf({projectName: 'my-app', cwd: '/your/writable/sandbox/config'});
config.set('theme', 'dark');
console.log(config.get('theme'));
```

Use a writable application sandbox directory and the Electron main process.
Expose narrow IPC operations to isolated renderers. No Node/Electron engine,
HAP, SDK, signing material or runtime syscall helper is included in this package.
Upstream requires Node >=22. Exact validated engine versions and any earlier
engine integration requirements are recorded in the recipe release evidence;
do not assume all conf options work on every engine solely from installation.

Representative verification covers disk persistence/reopen, schemas, defaults,
nested keys, migrations, encryption, corruption, change events, serialization,
errors and Worker exit. It is not the full upstream suite. Test launchers use
--jitless; conf does not require JIT or WASM. Complete device-side npm CLI
installation is outside the recorded scope; production dependencies are
normally installed and locked on the host before device deployment.

Upstream: https://github.com/sindresorhus/conf
Recipe: https://github.com/ohos-ports-electron/ohos-ports-electron/tree/main/ports/conf/16.0.0
