# @ohos-ports-electron/node-gyp-build 4.8.4-electron-oh.0

HarmonyOS PC port of `node-gyp-build@4.8.4`（上游 commit `6822ec5`），pure-runtime（纯 JS，
零第三方运行时依赖）。**零功能补丁**：API/导出面、bin 命令、许可证与 Node 行为完全一致，
仅 `package.json` 分发元数据改为本 scope。

## 候选构成（实际 npm tgz，9 文件）

- `bin.js` / `build-test.js` / `index.js` / `node-gyp-build.js` / `optional.js`：上游原样（未改字节）。
- `package.json`：name=`@ohos-ports-electron/node-gyp-build`，version=`4.8.4-electron-oh.0`，
  `repository.directory`=`ports/node-gyp-build/4.8.4`，bugs 指向聚合仓库 issues；其余字段（main/imports/bin/author/license/homepage/scripts）保留上游。
- `LICENSE`、`README.md`、`SECURITY.md`：上游原样。

全部 9 文件哈希见 `electron-oh/inputs.lock.json` 与第一阶段 `reports/package-contents.json`。

## 配方文件（不进入 npm 包）

| 文件 | 职责 |
| --- | --- |
| `patchs/` | 空——纯 JS 零功能补丁（补丁基线即 npm tgz，无源码差异） |
| `build.sh` | bash 包装 → `electron-oh/tools/build.cjs`（锁定基线 tgz → 元数据改写 → 候选 tgz） |
| `publish.sh` | 默认禁发；CI 显式 `ENABLE_ELECTRON_OH_PUBLISH=1` 才放行（release.py 校验证据 ready + CI 五元组 → OIDC 发布） |
| `electron-oh/inputs.lock.json` | 基线、候选、运行时锁定 |
| `electron-oh/tools/` | build.cjs、suite.cjs、verify-candidate.cjs、release.py（候选校验 + 发布守卫） |
| `electron-oh/tests/` | assertions.cjs（6 条共享断言）、regression.cjs、host-contract.py、dependencies.lock.json |
| `electron-oh/release-evidence.json` | 发行状态证据（ready，四角色真机 6/6 ×2） |

## 构建交接 vs 最终 candidate.tgz

`build.sh` 在 CI 一次构建，把 **`candidate.tgz` + `meta.json`** 作为 artifact 交接；发布 job 下载同一 artifact，
由 `release.py` 核验候选 SHA256 == `inputs.lock.json` 与 `release-evidence.json`，**上传同一 tgz，不重新 pack**。
Electron 引擎（libelectron.so）、HAP、SDK 不属于库 npm 包——设备证据与运行时来源只记录在 lock/evidence，
不进入本 port 提交。

## 安装依赖 vs 测试依赖锁

- 库 npm 包**零运行时依赖**（上游 `dependencies` 为空）。
- `devDependencies`（array-shuffle / standard / tape）仅为上游测试需要，不打进候选；host-contract 用
  `tests/dependencies.lock.json`（`file:./candidate.tgz`）做普通安装回归。
- 所有文件 LF 行尾；无 Windows 专属文件、无原生二进制。

## 验证（详见第一阶段工程 reports/ 与 release-evidence.json）

| 目标 | baseline 4.8.4 | candidate |
| --- | --- | --- |
| node（设备 Node 24.13.0） | 6/6 ×2 | 6/6 ×2（真机） |
| electron-reference（Electron-OH 37.2.0） | 6/6 ×2 | 6/6 ×2（真机） |
| electron34（Electron-OH 34.8.6） | 6/6 ×2 | 6/6 ×2（真机） |
| electron40（Electron-OH 40.0.1） | 6/6 ×2 | 6/6 ×2（真机） |

electron25 由调用方明确移出范围（Electron-OH 无官方 v25 发行物）。

## 发行状态

**ready**：候选哈希 `780ddd73...` 与 inputs.lock / release-evidence 绑定一致；四必需角色设备证据齐全。
CI 经 `.github/workflows/node-gyp-build-electron-oh.yml` 的 build → compatibility（Node 20.18.1/22.17.0/24.11.1/24.13.0）→
publish（仅 main push，environment `npm-publish`，OIDC）发布 `latest`，发布后轮询 registry 校验 integrity。
线上 Trusted Publisher 为按包的一次性 npm 账号配置，普通提交无法创建，需维护者完成。
