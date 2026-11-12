# @ohos-ports-electron/windows-registry 1.3.0-electron-oh.0

HarmonyOS PC port of `@vscode/windows-registry@1.3.0`（微软 vscode 生态的 Windows
注册表读取 N-API 原生模块）。**零功能补丁**：`dist/` 交付 JS、许可证与上游完全一致，
仅分发元数据（name/version/repository/description/bugs/homepage）与包内 README 改写，
并移除原生构建输入（`binding.gyp`/`src/winregistry.cc`，见下）。

## 候选构成（实际 npm tgz 共 8 文件）

- `dist/index.js`、`dist/index.d.ts`、`dist/index.js.map`、`License.txt`、`SECURITY.md`
  等 5 个上游文件原样（字节不变，哈希见 `electron-oh/package-inventory.json`）。
- `package.json`：name=`@ohos-ports-electron/windows-registry`，
  version=`1.3.0-electron-oh.0`，`repository.directory`=`ports/windows-registry/1.3.0`，
  bugs/homepage 指向聚合仓库；其余字段保留上游。
- `README.md`：port 说明（见 `electron-oh/PACKAGE_README.md`）；上游 README 存为
  `README.upstream.md`。
- **移除**：`binding.gyp` + `src/winregistry.cc`（Windows-only 原生构建输入）。npm 在
  `binding.gyp` 存在且无 install 脚本时自动执行 `node-gyp rebuild`，而本包在鸿蒙上
  addon 由平台守卫短路永不加载（`dist/index.js` 顶层 `process.platform==='win32'`），
  保留构建触发器只会让 OHOS 端 `npm install` 无谓触发 node-gyp 失败。这是 B-03
  "跳原生构建"决策，非功能补丁。

## 配方文件（不进入 npm 包）

| 文件 | 职责 |
| --- | --- |
| `patchs/` | 空——纯 JS 零功能补丁（无源码差异） |
| `build.sh` | bash 包装 → `electron-oh/tools/build.py`（锁定基线 tgz + 元数据/README 改写 + 原生输入移除 → 候选 tgz） |
| `publish.sh` | 默认禁发；CI 显式 `ENABLE_ELECTRON_OH_PUBLISH=1` 才放行（release.py 校验证据 ready + CI 四元组 + OIDC 发布） |
| `electron-oh/inputs.lock.json` | 基线、候选（sha256 + integrity + files inventory）、移除清单与发行身份锁定 |
| `electron-oh/package-inventory.json` | 候选包内 8 文件逐项 SHA256（build manifest `files` 一致） |
| `electron-oh/tools/` | build.py、release.py（候选校验 + 发布守卫 + OIDC 双标签） |
| `electron-oh/tests/` | suite.cjs（3 条公开契约断言）、cases.json、run-suite.cjs、release-contract.py |
| `electron-oh/release-evidence.json` | 发行状态证据（ready，四角色真机 3/3 ×2） |
| `electron-oh/PACKAGE_README.md` | 面向 npm 使用者的包说明 |

## 构建交接 vs 最终 candidate.tgz

`build.sh` 在 CI 一次构建，以 **`candidate.tgz` + `manifest.json`** 作为 artifact 交接；
发布 job 下载同一 artifact，经 `release.py verify` 核验候选 SHA256 == inputs.lock ==
release-evidence，**上传同一 tgz，不重新 pack**。Electron 引擎、HAP、SDK 不属于库 npm 包——
设备证据与运行时来源只记录在 lock/evidence，不进入本 port 提交。

## 安装依赖 vs 测试依赖锁

- 库 npm 包**无运行时依赖**（上游 devDependencies 仅 mocha/ts-node/typescript，不入包）。
- 测试无额外供给；host CI 直接 `npm install <candidate.tgz>`（无 node-gyp 触发）。
- 候选不含原生二进制；全文件 LF 行尾。

## 验证（详见第一阶段工程 reports/ 与 release-evidence.json）

| 目标 | baseline 1.3.0 | candidate |
| --- | --- | --- |
| node（设备 Node 24.13.0） | 3/3 ×2 | 3/3 ×2（真机） |
| electron-reference（Electron-OH 37.2.0） | 3/3 ×2 | 3/3 ×2（真机） |
| electron34（Electron-OH 34.8.6） | 3/3 ×2 | 3/3 ×2（真机） |
| electron40（Electron-OH 40.0.1） | 3/3 ×2 | 3/3 ×2（真机） |

名册 3 条 = 2 条上游非 Windows 契约用例（GetStringRegKey/GetDWORDRegKey 恒抛
only-available-on-Windows、消息字面量）+ 1 条补写导出面用例（F-01-01，两个函数导出）。
win32 分支 9 条平台独有用例按平台不适用排除。electron25 不在默认矩阵（未要求）。

## 发行状态

**ready**：候选哈希 `5aaa8f00...` 与 inputs.lock / release-evidence 绑定一致；四必需角色
设备证据齐全。CI 由 `.github/workflows/windows-registry-electron-oh.yml`：
build → compatibility（Node 20.18.1/22.17.0/24.11.1/24.13.0）→ publish（仅 main push，
environment `npm-publish`，OIDC）发布 `beta` 并写 `latest`+`beta` 双标签，发布后轮询 registry
校验 integrity。线上 Trusted Publisher 为按包的一次性 npm 账号配置，需维护者完成（含独立
dist-tag 权限）。
