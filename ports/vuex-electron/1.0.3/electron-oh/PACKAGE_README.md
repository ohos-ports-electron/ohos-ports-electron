# @ohos-ports-electron/vuex-electron

`@ohos-ports-electron/vuex-electron` 1.0.3-electron-oh.0 是鸿蒙 PC (OpenHarmony) 移植的
`vuex-electron@1.0.3`：Vuex 的 Electron 插件，提供 `createPersistedState` 与
`createSharedMutations`。纯 JS、MIT。**Electron-only**：加载依赖 `require('electron')` 与
`electron-store`，独立鸿蒙 Node 无法加载（node 角色记 not-applicable）。

与上游 `vuex-electron` **零功能差异**（零补丁）：API/导出面、许可证、行为完全一致，
仅 `package.json` 分发元数据改为本 scope（name/version/repository/description/bugs + files 白名单）。

## 安装

```sh
npm install @ohos-ports-electron/vuex-electron
```

## 用法

```js
const { createPersistedState, createSharedMutations } = require('@ohos-ports-electron/vuex-electron');

// 主进程：持久化 + 跨窗口共享 mutation
const store = new Vuex.Store({
  state: { count: 0 },
  mutations: { increment(state) { state.count++ } },
  plugins: [
    createPersistedState({ storage: new ElectronStore() }),
    createSharedMutations({ type: 'main' })
  ]
});
```

渲染进程安装 shared-mutations（renderer 模式）后，dispatch 经 ipcMain/ipcRenderer 桥在主进程
执行并广播回所有窗口；renderer 模式直接 `commit` 会抛 `[Vuex Electron] Please, don't use
direct commit's, use dispatch instead of this.`。

## 鸿蒙 PC 提示

- 依赖 `electron-store`（Electron 主进程 `app.getPath('userData')`）——需在 Electron-OH
  主进程使用；设备 demo 已将 electron-store 及其运行时闭包打包在 HAP payload 中验证。
- 纯 JS，无原生绑定、无 JIT/WASM 要求；demo 以 `--jitless` 运行。
- 独立鸿蒙 Node 目标不适用（库顶层 require electron），如实记录而非伪造通过。
