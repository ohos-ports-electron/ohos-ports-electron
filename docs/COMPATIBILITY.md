# Electron 与进程兼容性初步分析

评审日期：2026-11-10。覆盖当日 npm `@ohos-ports-electron` 的 34 个公开包。

## 口径与证据

- 网页「版本」使用 npm `latest` 的具体包版本，安装命令固定该版本。`beta` 标签不再决定展示或安装；兼容性映射只在 `version` 与 `latest_version` 相等时生效，包升级后须复核。
- 「支持的Electron版本」列出已有成功验收记录的 **Electron 主版本**，不表示该系列全部小版本通过，也不把运行时阻塞或单纯构建目标列为通过。具体发行物、引擎哈希、启动参数和功能范围以各配方证据为准。
- 主进程 `true` 复用与当前包版本绑定的既有真机记录。本轮没有重新执行鸿蒙真机测试；Node Worker 验证也不等于 renderer 验证。
- 渲染进程以普通隔离/沙箱页面为基准。Electron 官方说明：沙箱 renderer 不初始化 Node 环境，文件、子进程等特权操作需要 IPC 委托主进程；preload 的有限 `require` 不能当作完整 Node 模块加载器。[官方进程沙箱文档](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- `renderer: true` 的 4 项均为源码/分发入口初评，网页显示黄色「△ 渲染进程（初评）」；需要满足备注中的打包或依赖条件，尚无本轮渲染进程真机通过结论。没有推荐通过关闭 sandbox 或开启 nodeIntegration 来让全部 Node 包显示兼容。
- `renderer: false` 表示当前完整入口不适合直接用于普通沙箱渲染页面，仍可由主进程经受限 IPC 提供能力；不声称所有非沙箱/preload 配置均不可运行。`null` 表示仍需验证，不能解读为不兼容。

源码评估使用 npm 发布的准确版本 tarball，重点检查了 browser/exports、UMD/ESM、Node 原生模块和 IPC 依赖；不是仅按包名或「纯 JS」分类。

## 需要保留的差异

- `better-sqlite3`：当前 .0 仅标 Electron 37。已有新 scope 真机记录为 37.2.0 主进程 18/18、两次冷启动，受测 tarball SHA-256 为 `1351315b34263c9c0f8931b5489b4943ba788a2825deab8360b517b5fe67a2aa`，本轮核对 npm integrity 与该候选一致。
- `better-sqlite3-multiple-ciphers`：仅标 37/40。34 的真实装载因 N-API 9 / 10 不匹配崩溃，不列为支持。
- `systeminformation`：仅标 34/37。40.0.1 的 SIGCHLD/waitpid 运行时阻塞没有计入支持。
- `vscode-deviceid`、`onnxruntime-node`、`napi-rs-canvas`：历史 Electron 40 证据包含 40.0.0 发行物自报 40.1.0 的情况，不能据此推断 40.0.1 已通过。Canvas 的 37/40 还依赖锁定引擎哈希的宿主修复。
- `jimp`：准确发布包的 `dist/browser/index.js` 内容是 `export {}; // A stub. The real build is done by rollup.`；存在 browser 导出键不等于浏览器功能可用，因此 renderer 留空。
- `vuex-electron`：`dist/shared-mutations.js` 有 renderer 模式，但根入口也加载主进程持久化依赖 `electron-store`；需要明确 subpath、打包和 preload/IPC 接入后再验收，因此 renderer 留空。
- `vscode-oniguruma`：已有主进程和 Worker 的 asm.js 后备验证，浏览器 WASM 与新增 CommonJS 后备模块在沙箱页面的打包尚未验证，因此 renderer 留空。
- `windows-foreground-love`：鸿蒙侧兼容 no-op，通过验收不表示实现 Windows 前台窗口能力。

## 逐包结论

所有行的主进程标注为 `true`。下表「初评可用」对应 `renderer: true, renderer_status: preliminary`；「普通沙箱不直接加载」对应 `false`；「待确认」对应 `null`。

| 包 | 对应包版本 | 已有成功记录的 Electron 主版本 | 渲染进程初评 | 条件与边界 | 证据 |
| --- | --- | --- | --- | --- | --- |
| `7zip-bin` | `5.2.0-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 提供 7za/7x 二进制路径，依赖 Node 的 fs/path/process；普通沙箱渲染页面不直接调用本机二进制。 | [证据1](../ports/7zip-bin/5.2.0/electron-oh/release-evidence.json)、[证据2](../ports/7zip-bin/5.2.0/electron-oh/PACKAGE_README.md) |
| `7zip-min` | `3.0.1-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 依赖 Node child_process、fs 和 7za 可执行文件；解压缩操作放在主进程。 | [证据1](../ports/7zip-min/3.0.1/electron-oh/release-evidence.json)、[证据2](../ports/7zip-min/3.0.1/electron-oh/PACKAGE_README.md) |
| `address` | `2.0.3-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 读取网卡/IP/MAC 依赖 Node os、fs 和系统命令，普通沙箱渲染页面通过 IPC 获取结果。 | [证据1](../ports/address/2.0.3/electron-oh/release-evidence.json)、[证据2](../ports/address/2.0.3/electron-oh/PACKAGE_README.md) |
| `axios` | `1.21.0-electron-oh.0` | 25 / 34 / 37 / 40 | 初评可用 | 初步源码评估：选择 browser 条件导出或 dist/browser/axios.cjs，使用 XHR/浏览器适配器；受 Chromium CORS 与网络策略约束。现有真机记录只覆盖主进程 HTTP，未覆盖渲染进程 XHR。 | [证据1](../ports/axios/1.21.0/electron-oh/release-evidence.json)、[证据2](../ports/axios/1.21.0/electron-oh/PACKAGE_README.md) |
| `better-sqlite3` | `13.0.3-electron-oh.0` | 37 | 普通沙箱不直接加载 | SQLite 原生 Node 插件，已有接入方式为主进程管理数据库并通过 IPC 提供业务接口；未标注渲染进程直接装载。 | [证据1](https://gitcode.com/OhosPortingSource/better-sqlite3/blob/feat/better-sqlite3-13.0.3-electron-oh/electron-oh/13.0.3/reports/new-scope/electron/verification.json)、[证据2](../ports/better-sqlite3/13.0.3/electron-oh/README.md) |
| `better-sqlite3-multiple-ciphers` | `13.0.4-beta.0-electron-oh.0` | 37 / 40 | 普通沙箱不直接加载 | 加密 SQLite 原生 Node 插件，依赖 N-API 10；普通沙箱渲染页面通过主进程数据库接口访问。 | [证据1](../ports/better-sqlite3-multiple-ciphers/13.0.4-beta.0/electron-oh/release-evidence.json)、[证据2](../ports/better-sqlite3-multiple-ciphers/13.0.4-beta.0/electron-oh/PACKAGE_README.md) |
| `bytenode` | `1.7.0-electron-oh.0` | 25 / 34 / 37 / 40 | 普通沙箱不直接加载 | 字节码加载依赖 Node vm/v8/fs 和模块系统；现有 Electron 主进程验证不等于 electronRenderer 编译/运行路径通过。 | [证据1](../ports/bytenode/1.7.0/electron-oh/release-evidence.json)、[证据2](../ports/bytenode/1.7.0/electron-oh/PACKAGE_README.md) |
| `compressing` | `2.1.3-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 文件压缩依赖 Node fs、zlib 与流；普通沙箱渲染页面通过 IPC 发起操作。 | [证据1](../ports/compressing/2.1.3/electron-oh/release-evidence.json)、[证据2](../ports/compressing/2.1.3/electron-oh/PACKAGE_README.md) |
| `conf` | `16.0.0-electron-oh.0` | 25 / 34 / 37 / 40 | 普通沙箱不直接加载 | 配置持久化依赖 Node 文件系统、路径及加密；现有包说明要求主进程使用，通过 IPC 暴露受限操作。 | [证据1](../ports/conf/16.0.0/electron-oh/release-evidence.json)、[证据2](../ports/conf/16.0.0/electron-oh/PACKAGE_README.md) |
| `electron-context-menu` | `5.1.0-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 使用 Electron Menu/BrowserWindow/webContents 等主进程 API；在主进程为窗口配置菜单。 | [证据1](../ports/electron-context-menu/5.1.0/electron-oh/release-evidence.json)、[证据2](../ports/electron-context-menu/5.1.0/electron-oh/PACKAGE_README.md) |
| `electron-is-dev` | `3.0.1-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 依赖 electron.app.isPackaged，包说明明确要求主进程；向渲染页面传递判定结果。 | [证据1](../ports/electron-is-dev/3.0.1/electron-oh/release-evidence.json)、[证据2](../ports/electron-is-dev/3.0.1/electron-oh/PACKAGE_README.md) |
| `env-paths` | `4.0.0-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 依赖 Node os、path 与 process 环境获取应用目录；普通沙箱渲染页面通过 IPC 获取路径。 | [证据1](../ports/env-paths/4.0.0/electron-oh/release-evidence.json)、[证据2](../ports/env-paths/4.0.0/electron-oh/PACKAGE_README.md) |
| `fs-extra` | `11.4.1-electron-oh.0` | 25 / 34 / 37 / 40 | 普通沙箱不直接加载 | 依赖 Node fs/path/streams；普通沙箱渲染页面通过受限文件操作 IPC 接入。 | [证据1](../ports/fs-extra/11.4.1/electron-oh/release-evidence.json)、[证据2](../ports/fs-extra/11.4.1/electron-oh/PACKAGE_README.md) |
| `get-stream` | `9.0.1-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 现有入口及部分返回类型依赖 Node 流和 Buffer；本轮不把 Web Streams 子能力推断成完整渲染进程支持。 | [证据1](../ports/get-stream/9.0.1/electron-oh/release-evidence.json)、[证据2](../ports/get-stream/9.0.1/electron-oh/PACKAGE_README.md) |
| `jimp` | `1.6.1-electron-oh.0` | 34 / 37 / 40 | 待确认 | 待确认：已发布包 dist/browser/index.js 实际是 export {} 的占位文件；不能仅依据 browser 条件导出声称可用，需补齐正确浏览器打包与渲染进程测试。 | [证据1](../ports/jimp/1.6.1/electron-oh/release-evidence.json)、[证据2](../ports/jimp/1.6.1/electron-oh/PACKAGE_README.md) |
| `napi-build-utils` | `2.0.0-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 用于 Node-API 构建/版本判断，依赖 Node process.versions；普通沙箱渲染页面不是此工具的使用环境。 | [证据1](../ports/napi-build-utils/2.0.0/electron-oh/release-evidence.json)、[证据2](../ports/napi-build-utils/2.0.0/electron-oh/PACKAGE_README.md) |
| `napi-rs-canvas` | `1.0.2-electron-oh.5` | 25 / 34 / 37 / 40 | 普通沙箱不直接加载 | Skia 原生 Node 插件；主进程和 Node Worker 记录不等于渲染进程验证，普通页面应使用 Chromium Canvas 或 IPC。 | [证据1](../ports/napi-rs-canvas/1.0.2/electron-oh/release-evidence.json)、[证据2](../ports/napi-rs-canvas/1.0.2/electron-oh/PACKAGE_README.md) |
| `node-gyp-build` | `4.8.4-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 负责寻找和装载 Node 原生插件，依赖 fs/path/process/dlopen；普通沙箱渲染页面不能直接加载。 | [证据1](../ports/node-gyp-build/4.8.4/electron-oh/release-evidence.json)、[证据2](../ports/node-gyp-build/4.8.4/electron-oh/PACKAGE_README.md) |
| `node-machine-id` | `1.1.12-electron-oh.0` | 25 / 34 / 37 / 40 | 普通沙箱不直接加载 | 依赖 Node 文件系统及系统命令获取机器标识；普通沙箱渲染页面通过 IPC 使用。 | [证据1](../ports/node-machine-id/1.1.12/electron-oh/release-evidence.json)、[证据2](../ports/node-machine-id/1.1.12/electron-oh/PACKAGE_README.md) |
| `once` | `1.4.1-electron-oh.0` | 34 / 37 / 40 | 初评可用 | 初步源码评估：纯 JavaScript 函数包装，依赖 wrappy；将 CommonJS 入口与 wrappy 一起打包后可在浏览器渲染页面使用，尚未做渲染进程真机验收。 | [证据1](../ports/once/1.4.1/electron-oh/release-evidence.json)、[证据2](../ports/once/1.4.1/electron-oh/PACKAGE_README.md) |
| `onnxruntime-node` | `1.27.0-electron-oh.1` | 25 / 34 / 37 / 40 | 普通沙箱不直接加载 | Node 原生 ONNX Runtime 绑定，普通沙箱渲染页面不能直接加载；在主进程推理后通过 IPC 返回结果。 | [证据1](../ports/onnxruntime-node/1.27.0/electron-oh/release-evidence.json)、[证据2](../ports/onnxruntime-node/1.27.0/electron-oh/PACKAGE_README.md) |
| `open` | `11.0.4-electron-oh.0` | 25 / 34 / 37 / 40 | 普通沙箱不直接加载 | 现有接入依赖主进程/Node 与 Harmony Host Bridge；不是浏览器 window.open 的替代品。 | [证据1](../ports/open/11.0.4/electron-oh/release-evidence.json)、[证据2](../ports/open/11.0.4/electron-oh/PACKAGE_README.md) |
| `prebuild-install` | `7.1.3-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | npm 安装阶段下载/解包预构建产物的 Node CLI，依赖文件系统和网络，不作为渲染页面运行库。 | [证据1](../ports/prebuild-install/7.1.3/electron-oh/release-evidence.json)、[证据2](../ports/prebuild-install/7.1.3/electron-oh/PACKAGE_README.md) |
| `rxjs` | `7.8.2-electron-oh.0` | 25 / 34 / 37 / 40 | 初评可用 | 初步源码评估：使用浏览器 ESM/UMD 构建，核心流和操作符可在渲染页面使用；ajax/WebSocket/DOM/animationFrames 仍取决于浏览器环境，现有真机记录未覆盖这些功能。 | [证据1](../ports/rxjs/7.8.2/electron-oh/release-evidence.json)、[证据2](../ports/rxjs/7.8.2/electron-oh/PACKAGE_README.md) |
| `systeminformation` | `5.33.16-electron-oh.0` | 34 / 37 | 普通沙箱不直接加载 | 依赖 Node os/fs/child_process 采集系统信息；普通沙箱渲染页面通过主进程 IPC 获取结果。 | [证据1](../ports/systeminformation/5.33.16/electron-oh/release-evidence.json)、[证据2](../ports/systeminformation/5.33.16/electron-oh/PACKAGE_README.md) |
| `tar` | `7.5.22-electron-oh.0` | 25 / 34 / 37 / 40 | 普通沙箱不直接加载 | 依赖 Node fs/streams/zlib，普通沙箱渲染页面通过 IPC 发起归档操作。 | [证据1](../ports/tar/7.5.22/electron-oh/release-evidence.json)、[证据2](../ports/tar/7.5.22/electron-oh/PACKAGE_README.md) |
| `vscode-deviceid` | `0.1.5-electron-oh.1` | 34 / 37 / 40 | 普通沙箱不直接加载 | 依赖 Node fs、环境目录和设备标识逻辑；包说明要求主进程，渲染页面使用受限异步 IPC。 | [证据1](../ports/vscode-deviceid/0.1.5/electron-oh/release-evidence.json)、[证据2](../ports/vscode-deviceid/0.1.5/electron-oh/PACKAGE_README.md) |
| `vscode-native-watchdog` | `1.4.6-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 依赖双 ABI 原生 watchdog 插件及进程监控，Electron 分支明确面向主进程。 | [证据1](../ports/vscode-native-watchdog/1.4.6/electron-oh/release-evidence.json)、[证据2](../ports/vscode-native-watchdog/1.4.6/electron-oh/PACKAGE_README.md) |
| `vscode-oniguruma` | `2.0.1-electron-oh.0` | 25 / 34 / 37 / 40 | 待确认 | 待确认：浏览器原生 WASM 路径及适配后的 CommonJS asm.js 后备模块需分别验证打包；已有主进程/Node Worker 记录不能证明沙箱渲染页面可用。 | [证据1](../ports/vscode-oniguruma/2.0.1/electron-oh/release-evidence.json)、[证据2](../ports/vscode-oniguruma/2.0.1/electron-oh/PACKAGE_README.md) |
| `vscode-ripgrep` | `1.18.0-electron-oh.0` | 25 / 34 / 37 / 40 | 普通沙箱不直接加载 | 提供本机 rg 路径并依赖 Node 子进程执行搜索；普通沙箱渲染页面通过搜索 IPC 接入。 | [证据1](../ports/vscode-ripgrep/1.18.0/electron-oh/release-evidence.json)、[证据2](../ports/vscode-ripgrep/1.18.0/electron-oh/PACKAGE_README.md) |
| `vscode-textmate` | `9.3.2-electron-oh.0` | 34 / 37 / 40 | 初评可用 | 初步源码评估：核心发行文件为可打包的通用 JavaScript，渲染页面需自行提供 grammar 数据与浏览器兼容 onigLib；不包含文件读取或 Oniguruma/WASM 在渲染进程已验证的承诺。 | [证据1](../ports/vscode-textmate/9.3.2/electron-oh/release-evidence.json)、[证据2](../ports/vscode-textmate/9.3.2/electron-oh/PACKAGE_README.md) |
| `vuex-electron` | `1.0.3-electron-oh.0` | 34 / 37 / 40 | 待确认 | 待确认：shared-mutations 有 renderer 模式，但根入口还加载 electron-store，且需 ipcRenderer/preload 桥；现有验收仅覆盖主进程，不能声称整个包在普通沙箱页面可直接加载。 | [证据1](../ports/vuex-electron/1.0.3/electron-oh/release-evidence.json)、[证据2](../ports/vuex-electron/1.0.3/electron-oh/PACKAGE_README.md) |
| `which` | `7.0.0-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | 依赖 Node 文件系统、PATH、权限检查；普通沙箱渲染页面通过主进程查询可执行文件。 | [证据1](../ports/which/7.0.0/electron-oh/release-evidence.json)、[证据2](../ports/which/7.0.0/electron-oh/PACKAGE_README.md) |
| `windows-foreground-love` | `0.6.1-electron-oh.0` | 34 / 37 / 40 | 普通沙箱不直接加载 | Windows 专用前台窗口能力在鸿蒙侧保留兼容 no-op；现有主进程通过不表示鸿蒙拥有同等 Windows 能力。 | [证据1](../ports/windows-foreground-love/0.6.1/electron-oh/release-evidence.json)、[证据2](../ports/windows-foreground-love/0.6.1/electron-oh/PACKAGE_README.md) |

## 数据维护与废弃状态

[process-compatibility.json](process-compatibility.json) 记录准确包版本、Electron 主版本、进程值、初评标记、条件和证据。更新包版本后，不会自动把旧结论带到新版本。

[package-overrides.json](package-overrides.json) 记录本站包状态；本次按用户要求将 `@ohos-ports-electron/node-machine-id` 标为已废弃，影响网页行状态、废弃统计和筛选。该标记独立于兼容版本，刷新 npm 数据或包升级后仍保留。本次未对 npm Registry 执行 `npm deprecate`。如果 npm 自身标记废弃，优先保留 npm 的废弃原因和来源。
