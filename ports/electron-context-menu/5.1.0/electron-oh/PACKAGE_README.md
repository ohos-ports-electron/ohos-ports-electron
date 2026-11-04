# @ohos-ports-electron/electron-context-menu

`@ohos-ports-electron/electron-context-menu` 5.1.0-electron-oh.0 是鸿蒙 PC (OpenHarmony) 移植的
`electron-context-menu@5.1.0`：Electron 应用的右键上下文菜单库，支持文本编辑/媒体/链接/拼写检查/
自定义菜单项与动作变换。纯 ESM、MIT。**Electron-only**：index.js 顶层 `import 'electron'`，独立鸿蒙
Node 无法加载（node 角色记 not-applicable）。

与上游 `electron-context-menu` **零功能差异**（零补丁）：API/导出面、许可证、行为完全一致，
仅 `package.json` 分发元数据改为本 scope（name/version/repository/description/bugs）。

## 安装

```sh
npm install @ohos-ports-electron/electron-context-menu
```

## 用法

```js
// 主进程（ESM 动态接入）
import contextMenu from '@ohos-ports-electron/electron-context-menu';

contextMenu({
  prepend: (actions, parameters, browserWindow) => [
    {label: 'Search for “{selection}”'},
  ],
  append: actions => [actions.separator(), actions.saveImageAs()],
  labels: {copy: 'Kopier', paste: 'Innsett'},
});
```

库自动监听所有窗口的 `context-menu` 事件并弹出菜单；返回 `dispose()` 可卸载。支持
`showSaveImage/showSaveVideo/showCopyVideoFrame/showPictureInPicture/showLearnSpelling`、
自定义 `search`、`prepend/append`、同 id 覆盖默认动作、`updateMenu` 终稿调整、`transform` 动作内容变换等。

## 鸿蒙 PC 提示

- 依赖 `electron-dl`（保存类下载动作）与 `electron-is-dev`/`cli-truncate`；设备 demo 已将完整运行时
  闭包打包在 HAP payload 中验证。
- 纯 JS，无原生绑定、无 JIT/WASM 要求；demo 以 `--jitless` 运行。
- 剪贴板读路径与 bookmark 自定义格式按「文本通道生效 + 调用不崩溃」口径验证（鸿蒙权限分档）；
  保存类动作经 electron-dl 记录桩验证下载 URL 改写链路。
- 独立鸿蒙 Node 目标不适用（库顶层 import electron），如实记录而非伪造通过。
