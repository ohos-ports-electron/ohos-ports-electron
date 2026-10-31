# vscode-native-watchdog 1.4.6 · Electron-OH port

上游 `@vscode/native-watchdog@1.4.6`（Microsoft，MIT，N-API 看门狗 addon：
`start(pid)` 监控指定进程、其终止后当前进程约 6s 内以退出码 87 退出；`exit(code)` 立即以指定码终止）
的 Electron-OH / 鸿蒙 PC 移植 port。

- 候选 npm 包：`@ohos-ports-electron/vscode-native-watchdog@1.4.6-electron-oh.0`
  （`latest` + `electron-oh` 双 tag；原 Node 行为与其他平台语义不变）
- 基线：`@vscode/native-watchdog@1.4.6`（https://www.npmjs.com/package/@vscode/native-watchdog，
  tarball sha256 `1ce4a2d1…d2e608d`，见 `electron-oh/inputs.lock.json`）

## 一、候选包的 13 个文件与来源

| 包内路径 | 来源 |
| --- | --- |
| `index.js` | 基线 + `patchs/0001-*.patch`（双 ABI 装载分流；Electron-OH 40 主进程自报 `platform='ohos'`、34/37 为 `'openharmony'`，双串命中 Electron 分支） |
| `package.json` | 基线 + `patchs/0002-*.patch`（name/version/repository/bugs/homepage/files/install 分发元数据改写） |
| `index.d.ts`、`src/watchdog.cc`、`src/common.h`、`binding.gyp`、`LICENSE`、`README.md`、`SECURITY.md` | 上游原字节（9 基线文件中的 7 个），未改动 |
| `scripts/install.cjs` | `patchs/0002` 新增；源文件为 `electron-oh/install.cjs`（openharmony/ohos 预编译直用；其他平台显式转交 node-gyp rebuild——与上游 binding.gyp 自动检测的有效语义一致） |
| `README.electron-oh.md` | `patchs/0002` 新增；源文件为 `electron-oh/PACKAGE_README.md` |
| `build/Release/watchdog.node` | **二进制供给**：device-node ABI（arm64/openharmony；`napi_*`/`uv_thread_create` 留 UND 由宿主 node 解析；`-Wl,--code-sign` 自签；22912B）——不进 patchs，见下「原生二进制」 |
| `electron-oh/watchdog.node` | **二进制供给**：Electron-OH ABI（37.2.0 契约：链 libshim.a + uv_thread_supplement；HIDE_NAPI_AND_UV 下无 napi_/uv_ UND；47488B）——Electron 应用构建链部署至 HAP 应用原生库目录（electron/libs/arm64-v8a） |

## 二、配方文件（本目录，全部不入 npm 包）

| 文件 | 职责 |
| --- | --- |
| `patchs/0001-ohos-electron-addon-path-fallback.patch` | 唯一功能补丁：`index.js` 双 ABI 装载分流（Electron 主进程沙箱绝对路径候选探测 / 纯 node 进程包内相对路径 → 私有 HNP bin 兜底；Linux/macOS/Windows 行为不变） |
| `patchs/0002-electron-oh-package.patch` | 纯分发元数据：包身份/仓库/install 入口/README.electron-oh.md |
| `build.sh` → `electron-oh/tools/build-candidate.mjs` | 从锁定基线 + 锁定原生归档组装候选（`--native-url` CI 通道 / `--native-dir` 本地通道），输出 `candidate.tgz + manifest.json`，`--verify` 与 `inputs.lock.json` 三重哈希对账 |
| `publish.sh` → `electron-oh/tools/release.cjs` | 默认禁发；仅上传工作流交接的同一冻结 tgz（manifest 对账 + registry 幂等核对：同字节跳过、异字节拒绝、非 404 失败） |
| `electron-oh/inputs.lock.json` | 基线 tgz / 候选三重哈希（tgz sha256、gunzip tar sha256、npm integrity）/ 双 ABI 预编译哈希 / 设备运行时上下文 |
| `electron-oh/native-artifact.lock.json` | 原生归档 sha256 + 逐成员 sha256 + 托管地址（已托管于本仓 Release，回下载校验一致） |
| `electron-oh/tools/build-addon.cjs` + `uv_thread_supplement.c` | 维护者重建路径：DevEco NDK（26.0.0.105 / API 26）clang++ 15.0.4 双 ABI 交叉编译；CI 不重编原生库（onnxruntime-node / napi-rs-canvas 同款托管归档模式） |
| `electron-oh/tests/suite.cjs` | 3 用例回归（上游 test/test.js 集成语义重构 kill-on-death→87、start 契约、exit 契约）——设备侧与宿主矩阵共用同一断言 |
| `electron-oh/tests/run-host.cjs` | 宿主兼容作业入口：安装同一 tgz（非 OHOS 平台经 install.cjs 转交 node-gyp 源码编译，验证上游语义保持）+ 跑 suite |
| `electron-oh/tests/host-contract.py` | 交接产物（manifest + candidate.tgz）与当前 checkout 锁的对账 |
| `electron-oh/release-evidence.json` | 精简设备验证证据（见下） |
| `electron-oh/licenses/` | 随二进制分发的许可/告知材料（Node 24.13.0、OHOS NDK 26.0.0.105 LLVM/Native、Electron-OH 37.2.0 napi-library） |

## 三、构建交接与最终 tgz 的区别

`build.sh` 输出的 `candidate.tgz` 是唯一发布对象；manifest.json 只作交接校验。Electron 引擎
（libelectron.so）、HAP、SDK、私有 HNP 运行时、demo 工程与完整报告**都不属于 npm 包**，留在
单库验证工程（阶段 01：`E:\jsAdaptPublish\vscode-native-watchdog 1.4.6`，交接契约 handoff.json
release=ready）。

## 四、安装/测试依赖

- 运行时零 npm 依赖（上游即为无依赖纯 addon 包）；`files` 白名单见 package.json
- 宿主兼容矩阵（CI）：Node 20.18.1 / 22.17.0 / 24.11.1 / 24.13.0（阶段 01 实际运行矩阵）在
  Ubuntu 上 `npm install` 同一 tgz——install.cjs 转交 node-gyp 从 `src/watchdog.cc` 源码编译
  （与上游一致），随后执行 `electron-oh/tests/suite.cjs` 全部 3 用例
- 原生二进制：arm64/openharmony 专用，宿主（linux x64）不加载它们——宿主矩阵走源码编译路径

## 五、构建与 CI 接入

- PR / 本地：`build.sh --native-dir <dir> --baseline <tgz> --verify`（或 `--native-url`）
- CI：`vscode-native-watchdog-electron-oh.yml`（build：`WATCHDOG_NATIVE_URL` 取锁定归档 →
  组装同字节 tgz → artifact 交接；compatibility：四 Node 版本安装+回归；publish：仅 main push、
  `npm-publish` environment、OIDC，上传同一 tgz 不重新 pack）
- 前置一次性线上配置见 `electron-oh/README.md`（归档托管 + 仓库变量 + Trusted Publisher）

## 六、本次版本发布状态

`1.4.6-electron-oh.0` 尚未发布（registry 无此包，2026-10-31 查证）。合入 main 且完成
Trusted Publisher 配置后由 CI 首次发布。

## 七、验证矩阵摘要（阶段 01，真机 OpenHarmony-7.0.0.109 / API 26 / aarch64）

| 目标 | 基线（原包） | 候选 |
| --- | --- | --- |
| 独立 node 24.13.0（DevNode-OH） | 0/3 × 2 | **3/3 × 2** |
| Electron-OH 37.2.0（reference） | 0/3 × 2 | **3/3 × 2** |
| Electron-OH 34.8.6 | 0/3 × 2 | **3/3 × 2** |
| Electron-OH 40.0.1 | 0/3 × 2 | **3/3 × 2** |

基线失败（`Cannot find module './build/Release/watchdog'`）为原包纯源码发布在 openharmony
无编译通道的如实记录——本 port 的存在依据。
