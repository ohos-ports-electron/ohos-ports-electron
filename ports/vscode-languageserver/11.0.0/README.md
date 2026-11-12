# @ohos-ports-electron/vscode-languageserver 11.0.0-electron-oh.0

HarmonyOS PC port of `vscode-languageserver@11.0.0`（上游 vscode-languageserver-node
monorepo 的 server 子包，commit `898f44d`）。**零功能补丁**：lib/common + lib/node 公开
API、许可证与 Node 行为与上游完全一致，仅分发元数据（name/version/repository/description/bugs）
与包内 README 改写。运行时依赖闭包 `vscode-languageserver-protocol@3.18.5`（→
`vscode-jsonrpc` / `vscode-languageserver-types`）均为纯 JS，鸿蒙上原样可用。

## 候选构成（实际 npm tgz 共 58 文件）

- `lib/common/*.js`、`lib/node/*.js`、`lib/browser/*.js`、`typings/`、`License.txt`、
  `thirdpartynotices.txt`、`bin/installServerIntoExtension` 等 55 个上游文件原样
  （字节不变，哈希见 `electron-oh/package-inventory.json`）。
- `package.json`：name=`@ohos-ports-electron/vscode-languageserver`，
  version=`11.0.0-electron-oh.0`，`repository.directory`=`ports/vscode-languageserver/11.0.0`，
  bugs 指向聚合仓库 issues；其余字段保留上游。
- `README.md`：port 说明（见 `electron-oh/PACKAGE_README.md`）；上游 README 存为
  `README.upstream.md`。

## 配方文件（不进入 npm 包）

| 文件 | 职责 |
| --- | --- |
| `patchs/` | 空——纯 JS 零功能补丁（补丁基线即 npm tgz，无源码差异） |
| `build.sh` | bash 包装 → `electron-oh/tools/build.py`（锁定基线 tgz + 元数据/README 改写 → 候选 tgz） |
| `publish.sh` | 默认禁发；CI 显式 `ENABLE_ELECTRON_OH_PUBLISH=1` 才放行（release.py 校验证据 ready + CI 四元组 + OIDC 发布） |
| `electron-oh/inputs.lock.json` | 基线、候选（sha256 + integrity + files inventory）、testSupply 与发行身份锁定 |
| `electron-oh/package-inventory.json` | 候选包内 58 文件逐项 SHA256（build manifest `files` 一致） |
| `electron-oh/tools/` | build.py、release.py（候选校验 + 发布守卫 + OIDC 双标签） |
| `electron-oh/tests/` | suite.cjs（24 条公开 API 断言）、cases.json、run-suite.cjs、release-contract.py |
| `electron-oh/release-evidence.json` | 发行状态证据（ready，四角色真机 24/24 ×2） |
| `electron-oh/PACKAGE_README.md` | 面向 npm 使用者的包说明 |

## 构建交接 vs 最终 candidate.tgz

`build.sh` 在 CI 一次构建，以 **`candidate.tgz` + `manifest.json`** 作为 artifact 交接；
发布 job 下载同一 artifact，经 `release.py verify` 核验候选 SHA256 == inputs.lock ==
release-evidence，**上传同一 tgz，不重新 pack**。Electron 引擎、HAP、SDK 不属于库 npm 包——
设备证据与运行时来源只记录在 lock/evidence，不进入本 port 提交。

## 测试供给（TextDocuments 文档工厂）

上游 `TextDocuments` 公开契约要求宿主提供一个文档工厂（上游把
`vscode-languageserver-textdocument` 声明为 devDependency 即为此）。本 port：

- **真机验证 + CI 宿主回归**：测试套件依赖 `vscode-languageserver-textdocument@1.0.16`
  （纯 JS，与候选字节无关），属测试供给、非库补丁、**不入候选包**。
- 运行时依赖（protocol/jsonrpc/types）保持上游不变，普通 `npm install` 自动解析。

## 安装依赖 vs 测试依赖锁

- 库 npm 包运行时依赖 `vscode-languageserver-protocol@3.18.5`（上游不变）。
- 测试依赖 `vscode-languageserver-textdocument@1.0.16`（`inputs.lock.json` `testSupply`）。
- 无 Windows 专属文件、无原生二进制入包；候选全文件 LF 行尾。

## 验证（详见第一阶段工程 reports/ 与 release-evidence.json）

| 目标 | baseline 11.0.0 | candidate |
| --- | --- | --- |
| node（设备 Node 24.13.0） | 24/24 ×2 | 24/24 ×2（真机） |
| electron-reference（Electron-OH 37.2.0） | 24/24 ×2 | 24/24 ×2（真机） |
| electron34（Electron-OH 34.8.6） | 24/24 ×2 | 24/24 ×2（真机） |
| electron40（Electron-OH 40.0.1） | 24/24 ×2 | 24/24 ×2（真机） |

名册为 24 条公开 API 用例（连接生命周期 initialize/shutdown、请求/通知分发、
TextDocuments open/change/close 经真实连接、协议类型与守卫、JSON-RPC 原语、
枚举/错误码、pipe 传输工厂）。monorepo 上游内部测试依赖 source 树，npm 发布布局不含，
故按公开 API 面重建名册。electron25 不在默认矩阵（未要求）。

## 发行状态

**ready**：候选哈希 `852ee117...` 与 inputs.lock / release-evidence 绑定一致；四必需角色
设备证据齐全。CI 由 `.github/workflows/vscode-languageserver-electron-oh.yml`：
build → compatibility（Node 20.18.1/22.17.0/24.11.1/24.13.0）→ publish（仅 main push，
environment `npm-publish`，OIDC）发布 `beta` 并写 `latest`+`beta` 双标签，发布后轮询 registry
校验 integrity。线上 Trusted Publisher 为按包的一次性 npm 账号配置，需维护者完成（含独立
dist-tag 权限）。
