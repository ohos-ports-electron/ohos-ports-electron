# vscode-deviceid 0.1.5：npm 包内容与发布配方

本目录是 `@ohos-ports-electron/vscode-deviceid` 的构建、验证和发布配方，
不是直接上传到 npm 的完整目录。当前配方生成 `0.1.5-electron-oh.1`。
构建工具下载锁定的鸿蒙基线包，在独立临时目录应用补丁并打包，发布阶段上传生成的同一个 tgz。

## 一、实际装进 npm 包的内容

当前候选 tgz 含以下 **19 个文件**，路径均相对于 npm 包根目录：

```text
package.json
dist/
  index.js
  devdeviceid.js
  storage.js
  index.d.ts
  devdeviceid.d.ts
  storage.d.ts
scripts/
  install.cjs
src/
  windows.cc
binding.gyp
electron-oh.json
README.md
README.electron-oh.md
LICENSE.txt
NOTICE.txt
CODE_OF_CONDUCT.md
CONTRIBUTING.md
SECURITY.md
SUPPORT.md
```

| 包内文件 | 来源及作用 |
| --- | --- |
| `dist/*.js` | 基线包的运行代码，经补丁增加 `ohos` 平台分支，并使用原生动态 `import("uuid")` 兼容 Node 20；保留 `openharmony` 和原有平台支持 |
| `dist/*.d.ts` | 基线包的类型声明，保持原字节 |
| `package.json` | 基线元数据经分发补丁修改，设置新 scope、修订版本、仓库、安装入口及发布配置，保留原 API 入口和运行依赖声明 |
| `scripts/install.cjs` | 从配方的 `electron-oh/install.cjs` 复制；仅 Windows 调用 node-gyp，鸿蒙不执行原生编译 |
| `src/windows.cc`、`binding.gyp` | 基线保留的 Windows 原生实现与构建配置；不是鸿蒙原生插件 |
| `electron-oh.json` | 构建时生成，记录包身份、基线来源、补丁哈希及鸿蒙不使用原生 addon 的信息；不包含补丁文件本身 |
| `README.electron-oh.md` | 从配方的 `electron-oh/PACKAGE_README.md` 复制，提供随包分发的 Electron-OH 接入说明 |
| 包内 `README.md` | 基线包原有说明，保持原字节；不是当前这份配方 README |
| `LICENSE.txt`、`NOTICE.txt` | 基线原有许可证及第三方声明，保持原字节 |
| 其余四个 `.md` 文件 | 基线原有行为准则、贡献、安全及支持文档，保持原字节 |

鸿蒙运行部分是纯 JS，包内不携带 Electron-OH 引擎、HAP、SDK、`libshim.a` 或鸿蒙 `.node` 二进制。
`fs-extra`、`uuid` 等运行依赖由 npm 按 `package.json` 解析安装，不将 `node_modules/` 打进当前 tgz。
后述测试依赖锁只约束 CI 回归环境，不改变用户安装时的依赖版本范围。

## 二、生成、验证和发布 npm 包所需的配方

以下路径相对于本目录。除表中明确标注的复制或生成内容外，配方文件本身不进入 npm 包。

| 配方路径 | 功能 | 是否进入 npm 包 |
| --- | --- | --- |
| `README.md`（本文） | 解释分发内容与配方边界 | 否 |
| `patchs/0001-ohos-platform-alias.patch` | 对基线增加 `ohos` 平台支持 | 补丁文件不进入，修改后的 JS 进入 |
| `patchs/0002-electron-oh-distribution.patch` | 修改包名、版本、安装入口和发布元数据 | 补丁文件不进入，修改后的 `package.json` 进入 |
| `patchs/0003-node20-native-uuid-import.patch` | 修正旧 Node 对 ESM uuid 的加载方式 | 补丁文件不进入，修改后的 JS 进入 |
| `build.sh` | 构建入口，调用构建工具 | 否 |
| `publish.sh` | 默认关闭发布，供受限的 main CI 显式启用 | 否 |
| `electron-oh/inputs.lock.json` | 固定基线包 URL、版本、完整性和补丁哈希 | 锁文件不进入；其中部分信息写入 `electron-oh.json` |
| `electron-oh/install.cjs` | 提供包内安装脚本 | 复制为 `scripts/install.cjs` |
| `electron-oh/PACKAGE_README.md` | 提供包内接入说明 | 复制为 `README.electron-oh.md` |
| `electron-oh/README.md` | 配方操作、运行环境和验证边界说明 | 否 |
| `electron-oh/tools/workflow.py` | 下载并校验基线、应用补丁、比较文件、打包并冻结构建交接清单 | 否 |
| `electron-oh/tools/release.py` | 校验产物和真机证据、检查版本占用与发布条件、上传同一 tgz | 否 |
| `electron-oh/tools/suite.cjs` | 执行十项功能断言，供宿主回归使用 | 否 |
| `electron-oh/tests/host-contract.py` | 安装回归、两次进程持久化和发布拒绝场景检查 | 否 |
| `electron-oh/tests/dependencies.lock.json` | 固定 CI 安装候选 tgz 和测试所用传递依赖的版本及完整性 | 否 |
| `electron-oh/release-evidence.json` | 保存与候选 tgz 哈希绑定的精简真机验证证据 | 否 |

构建输出的 `baseline.tgz`、`comparison.json`、`recipe/` 和 `bundle.json` 是 CI 交接材料，
也不嵌入 npm 包。其中 `candidate.tgz` 才是最终上传的 npm 包文件。

## 三、与仓库级流水线的关系

- [仓库发布说明](../../../docs/RELEASING.md)：描述认证配置、版本修订和发行流程。
- [自动发布工作流](../../../.github/workflows/npm-publish.yml)：调度构建、四个 Node 版本的回归，以及 main 合入后的发布作业。
- [本库配方操作说明](electron-oh/README.md)：提供本地构建、只读发行检查和完整 demo/报告的入口。

本库发布流程为：**锁定基线 → 应用补丁 → 生成 tgz → 验证同一 tgz → main CI 发布**。
当前 `.1` 已发布，同版本同字节会幂等跳过；增加本配方 README 不改变 npm 包内容，也不自动递增包版本。

构建后可用 `tar -tzf <构建输出目录>/candidate.tgz` 核对实际分发文件；tar 内路径带 `package/` 前缀。
