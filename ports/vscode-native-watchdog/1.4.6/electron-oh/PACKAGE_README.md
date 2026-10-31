# @ohos-ports-electron/vscode-native-watchdog（Electron-OH / 鸿蒙 PC 说明）

上游 `@vscode/native-watchdog`（Microsoft，MIT）的 HarmonyOS PC / Electron-OH 移植发行。
本包在上游 1.4.6 基线上叠加两层改动：

- **功能补丁（0001）**：`index.js` 双 ABI 装载分流——Electron-OH 主进程按 HAP 沙箱应用原生库
  目录绝对路径探测 electron ABI addon；纯 node 进程（device-node 宿主 / Electron 宿主 fork 的
  独立 node 子进程）走包内相对路径 `./build/Release/watchdog.node`，resfile 内 .node 无 native
  库标签 dlopen 不可用时探测同 bundle 私有 HNP bin。Linux/macOS/Windows 行为不变。
- **分发元数据（0002）**：包名/版本/仓库指向 ohos-ports-electron，新增 `scripts/install.cjs`
  （openharmony 预编译直用，其他平台显式转交 node-gyp rebuild，语义与上游一致）与本说明。

## 预编译 addon（openharmony / arm64）

| 包内路径 | ABI 契约 | 装载面 |
| --- | --- | --- |
| `build/Release/watchdog.node` | device-node ABI：`napi_*`/`uv_thread_create` 留 UND，由宿主 node dlopen 解析；DT_NEEDED=libc++_shared.so+libc.so；`-Wl,--code-sign` 自签 | 独立 node 24.13.0（DevNode-OH）宿主；Electron 应用 fork 的独立 node 子进程（私有 HNP bin 供给，`/data/app/<tool>.org/<ver>/bin/`） |
| `electron-oh/watchdog.node` | Electron-OH ABI：链 `libshim.a`（napi 垫片）+ `uv_thread_supplement`（`uv_thread_create` 以 `pthread_create` 直实现），`HIDE_NAPI_AND_UV` 下无 napi_/uv_ UND | Electron-OH 主进程（37.2.0 契约编译；34.8.6 / 40.0.1 真机实证装载通过——N-API 经 shim 桥跨版本稳定） |

两个 ABI 不可互换：Electron 主进程装载 device-node ABI 产物、或纯 node 子进程装载 electron ABI
产物，都会跨 V8 实例导致 SIGSEGV——装载分流是本包的核心契约。

## Electron-OH 应用接入

Electron-OH 应用的构建链需把包内 `electron-oh/watchdog.node` 部署到 HAP 的应用原生库目录
（`electron/libs/arm64-v8a/`，装机后为 `/data/storage/el1/bundle/electron/libs/arm64/`），补丁后的
`index.js` 会在 Electron 主进程按沙箱绝对路径候选探测装载。应用内 fork 独立 node 子进程时，node
二进制经同 bundle 私有 HNP 供给（子进程装载 HNP bin 内的 device-node ABI 副本）。

## 已验证平台矩阵

| 目标 | 引擎自报版本 | 结果 |
| --- | --- | --- |
| 独立 node（DevNode-OH 24.13.0，openharmony/arm64） | node 24.13.0 | 3/3 通过 × 2 次冷启动 |
| Electron-OH 37.2.0（reference） | electron 37.2.0 | 3/3 通过 × 2 次冷启动 |
| Electron-OH 34.8.6 | electron v34.8.6-release | 3/3 通过 × 2 次冷启动 |
| Electron-OH 40.0.1 | electron v40.0.1-release | 3/3 通过 × 2 次冷启动 |

验证用例：上游 test/test.js 集成语义（被监控进程消失后监控进程以退出码 87 终止）、start 契约
（不抛/返回 undefined/8s 观察窗存活）、exit 契约（87/0 立即终止 + 对照组）。原始包（无预编译）
在同一矩阵全部失败——`Cannot find module './build/Release/watchdog'`，即本移植的存在依据。

## 安装

```sh
# Electron-OH / 鸿蒙 PC（openharmony）：预编译直用
npm install @ohos-ports-electron/vscode-native-watchdog --tag electron-oh

# 其他平台：源码编译（与上游一致）
npm install @ohos-ports-electron/vscode-native-watchdog
```

`install` 脚本在 openharmony 上跳过编译（预编译已随包）；其他平台转交 `node-gyp rebuild`。
公开 API（`start(pid)` / `exit(code)`）与类型声明（`index.d.ts`）与上游完全一致。
