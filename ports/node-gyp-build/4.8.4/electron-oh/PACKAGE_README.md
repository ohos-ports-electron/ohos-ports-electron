# PACKAGE_README

`@ohos-ports-electron/node-gyp-build` 4.8.4-electron-oh.0 是鸿蒙 PC (OpenHarmony) 移植的
`node-gyp-build@4.8.4`：node-gyp 生态的构建工具与原生绑定加载器。纯 JS、零第三方运行时依赖、MIT。

与上游 `node-gyp-build` **零功能差异**（零补丁）：API/导出面、3 个 bin 命令、许可证与 Node 行为完全一致，
仅 `package.json` 分发元数据改为本 scope（name/version/repository/description/bugs）。

## 安装

```sh
npm install @ohos-ports-electron/node-gyp-build
```

## 用法

```js
const load = require('@ohos-ports-electron/node-gyp-build');
const binding = load(__dirname); // 按 build/Release → build/Debug → prebuilds/ → execPath 旁查找并加载 .node
```

```js
const { parseTags, matchTags, compareTags, parseTuple, matchTuple, compareTuples } = require('@ohos-ports-electron/node-gyp-build');
```

## 鸿蒙 PC 提示

- device-node / Electron-OH 宿主可直接加载 `.node` 绑定（N-API 通道）。
- 鸿蒙为 musl libc 但无 `/etc/alpine-release`，匹配带 `musl` 标签的预构建时宿主须显式 `LIBC=musl`
  （库原生支持该 env 覆盖，真机验证通过）。
- install 期 `node-gyp rebuild` 源码编译路径在设备 app 域受限（依赖外部工具链随包）；本包不携带预构建内容，
  绑定加载与 prebuild 存在时的安装流程不受影响。
