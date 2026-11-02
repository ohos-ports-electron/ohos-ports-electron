# PACKAGE_README

`@ohos-ports-electron/windows-foreground-love` 0.6.1-electron-oh.0 是鸿蒙 PC (OpenHarmony) 移植的
`windows-foreground-love@0.6.1`：Windows `AllowSetForegroundWindow` 的 Node N-API 封装。MIT。

与上游 **零功能差异**（零补丁）：API、许可证与 Node 行为完全一致，仅 `package.json` 分发元数据改为本 scope
（name/version/repository/description/bugs）。

## 安装

```sh
npm install @ohos-ports-electron/windows-foreground-love
```

> 库含 `binding.gyp`，npm 默认 install 会触发 `node-gyp rebuild`（Windows 上编译真实 addon；其他平台为占位编译）。
> 鸿蒙上 addon 永不加载，可直接用 tarball 装配或 `--ignore-scripts` 安装，无需 C++ 工具链。

## 用法

```js
const allowSetForegroundWindow = require('@ohos-ports-electron/windows-foreground-love').allowSetForegroundWindow;
console.log(allowSetForegroundWindow(process.pid)); // -> false (非 win32 平台)
console.log(allowSetForegroundWindow());            // -> false
```

## 鸿蒙 PC 平台契约（重要）

- 非 win32 平台（含鸿蒙），`index.js` 平台守卫（`process.platform !== 'win32'`）直接短路返回 `false`、
  **永不加载原生扩展**、不抛异常——这是上游对非 Windows 平台的显式设计契约
  （README「Other platforms: installs, but doesn't do anything and always returns false」）。
- 真实的前台激活授权能力（把其他进程窗口带到前台/授予其获焦权限）在鸿蒙**无等价 API**
  （`@ohos.window.shiftAppWindowFocus` 仅同应用内焦点转移，错误码 1300004 拒绝跨进程窗口），
  由消费者架构级替换承接：`startAbility` 激活目标 ability 至前台 / 目标应用自提升窗口焦点。
- 本包按上游契约交付为 no-op（恒 false），不崩溃、无类型异常。
