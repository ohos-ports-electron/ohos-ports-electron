# onnxruntime-node 1.27.0 · Electron-OH 配方

候选为 `@ohos-ports-electron/onnxruntime-node@1.27.0-electron-oh.1`，基线是已发布的 `@ohos-ports/onnxruntime-node@1.27.0-beta.13`。本地 1.30.0 适配工程仅提供参考方案和测试数据；原生代码实际锁定 ONNX Runtime 1.27.0 / API 27，不能用 1.30.0 core 替换。

冻结候选 SHA256：`1e8fb736dde3c0ba55cd068adf160692852b9804eb261b67a98dff8eba9a1040`。候选尚未发布；功能验证通过，发行状态为 **blocked**：原始运行时来源及五目标设备 npm CLI/postinstall 已补齐，每目标两轮安装与 20 项推理通过；完整报告和冻结原生输入已在 GitHub Release 托管并回下载验 SHA，发行等待首次 npm 发布认证。完整设备日志与签名 HAP 留在第一阶段工程，精简引用见 [release-evidence.json](electron-oh/release-evidence.json)。

## 实际 npm 包内容

准确清单为 [package-inventory.json](electron-oh/package-inventory.json)，包含全部 **72 个文件**的路径、长度、SHA256；[release-evidence.json](electron-oh/release-evidence.json) 再绑定同一清单及 tgz integrity。

| 实际包内路径 | 文件数 | 来源及用途 |
| --- | ---: | --- |
| `README.md` | 1 | 基线原说明，字节不变；不是本配方 README。历史安装命令指向上游包。 |
| `package.json` | 1 | 补丁修改名称、版本、仓库、平台和 postinstall，保留原作者、MIT、入口及依赖。 |
| `dist/{backend,binding,index,version}.{js,js.map,d.ts}` | 12 | 基线 JS/声明；仅 binding.js 经补丁加入选择逻辑，map 保留基线原件，不能认为是重生成的映射。 |
| `lib/{backend,binding,index,version}.ts` | 4 | 基线 TS；binding.ts 与 JS 的选择逻辑一起修改。 |
| `script/{build.js,build.ts,install-metadata-versions.js,install-metadata.js,install-utils.js,install.js,prepack.js,prepack.ts}` | 8 | 保留基线构建/安装辅助文件。 |
| `script/ohos-install.cjs` | 1 | 补丁生成的 postinstall：Electron-OH 和独立 Node 分别检查对应预构建。 |
| `bin/napi-v6/darwin/arm64/*` | 3 | 基线原生库及绑定，包含两个不同名称的同字节 dylib。 |
| `bin/napi-v6/linux/{x64,arm64}/*` | 4 | 基线 CPU core 与绑定。 |
| `bin/napi-v6/win32/{x64,arm64}/*` | 10 | 基线 DirectML.dll、dxcompiler.dll、dxil.dll、onnxruntime.dll、onnxruntime_binding.node。 |
| `bin/napi-v6/openharmony/arm64/*` | 3 | 基线独立 Node 的 core、binding 和 libc++_shared.so。 |
| `bin/electron-oh/napi-v6/arm64/*` | 2 | 新增独立 Electron core `libonnxruntime.so.1` 和 `onnxruntime_binding_electron.node`。 |
| `electron-oh-native.json` | 1 | 原生构建清单，绑定 core、binding、原生输入锁与源码补丁。 |
| `licenses/electron-oh/**` | 22 | 按原生锁复制的 ONNX Runtime、依赖、Electron、node-addon-api、LLVM/NDK 许可及 notices。 |

所有基线 `bin/**` 字节保留；新增 Electron 路径与独立 Node 路径分开。分发文件保留不代表这些平台均在本轮验证。已验证的鸿蒙平台为 arm64 CPU；不宣称 GPU/DirectML 在鸿蒙可用，也不宣称任意 Electron/Node 版本均兼容。

## 配方与分发边界

| 配方文件 | 职责 | 是否入 npm 包 |
| --- | --- | --- |
| `patchs/0001-ohos-platform-alias.patch` | ohos/openharmony 平台映射及安装入口 | 补丁文件不入包；修改对应 JS/TS/脚本 |
| `patchs/0002-distribution-metadata.patch` | 候选身份和 repository | 不入包；修改 package.json |
| `patchs/0003-ohos-native-source.patch` | API-27 原生源码修复、私有 C++ ABI、保留 cleanup hook | 不入包；生成新 Electron 原生文件 |
| `patchs/0004-electron-runtime-selector.patch` | Electron 与独立 Node 选择不同绑定 | 不入包；修改 binding.js / binding.ts |
| `patchs/0005-install-native-selection.patch` | postinstall 对应实际运行时的文件检查 | 不入包；修改 ohos-install.cjs |
| `build.sh`、`publish.sh`、`tools/*.py` | 构建、冻结交接、宿主回归、发布门禁 | 不入包 |
| `electron-oh/inputs.lock.json`、`native-inputs.lock.json` | 基线/补丁/源码/依赖/shim/许可哈希 | 不入包；原生锁 SHA 写入包内 native manifest |
| `native/{CMakeLists.txt,ohos-linux.toolchain.cmake,binding.lds}`、`native/vendor/**/include/**` | 原生构建支持及锁定头文件 | 不入包；参与生成原生文件 |
| `native/licenses/**` | 精确许可输入 | 复制到包内 licenses/electron-oh/** |
| `electron-oh/PACKAGE_README.md` | 实际包内原 README 的逐字节镜像，供核对 | 本文件不复制；包内 README 仍来自基线 |
| `tests/**`、`package-inventory.json`、`release-policy.json`、`release-evidence.json`、两层 README | 测试、来源、清单和维护/发布材料 | 均不入包 |

构建 bundle 只交接 `candidate.tgz`、`candidate.json`、`bundle.json`；只有 candidate.tgz 是上传 npm 的对象。构建暂存目录、Electron 引擎、HAP、SDK、shim 归档、完整源码、签名与日志均不属于 npm 包，也不提交到本 port。不要在配方目录执行 npm pack 代替确定性 builder；候选 package.json 的 files 字段并未列出新增 notices，直接重 pack 可能丢失它们。

安装依赖为 onnxruntime-common **1.27.0**、adm-zip **^0.5.16**、global-agent **^4.1.3**；npm 包不携带锁文件。`tests/package-lock.json` 仅锁定测试安装图及本地 input.tgz 的准确 integrity，不能称为用户安装依赖全固定；`native-inputs.lock.json` 则锁原生源码和编译依赖。

## 验证范围

| 官方发行包标识 | 设备实际 Electron | 设备实际 Node | 两次冷启动 |
| --- | --- | --- | --- |
| Electron-OH 25 / 20250306.1 | 25.3.2 | 18.15.0 | 各 20/20 |
| Electron-OH 34.5.4 | 0.0.0-no-git-tag-found | 20.18.1 | 各 20/20 |
| Electron-OH 37.2.0 | 37.2.0 | 22.17.0 | 各 20/20 |
| Electron-OH 40.0.0 | 40.1.0 | 24.11.1 | 各 20/20 |
| 独立鸿蒙 Node | — | 24.13.0 | 各 20/20 |

四个 Electron demo 另有逐用例页面和真实按钮重跑证据。25 的 demo 使用禁用 JIT 的启动配置和签名 Worker 别名布局，不能据此宣称未加这些配置的任意宿主可直接运行。本 port 提交测试与库配方，完整 demo 仍留在第一阶段工程。

[构建与验证步骤](electron-oh/README.md) · [仓库发行约定](../../../docs/RELEASING.md) · [独立构建/发布工作流](../../../.github/workflows/onnxruntime-node-electron-oh.yml) · [PR 静态检查](../../../.github/workflows/onnxruntime-node-electron-oh-checks.yml)
