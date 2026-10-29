# @ohos-ports-electron/systeminformation 5.33.16-electron-oh.0

HarmonyOS PC port of `systeminformation@5.33.16`（上游源码 commit `2929006`），pure-runtime
（纯 CommonJS，零原生依赖）。保留上游 60 导出面与 MIT 许可证，新增 OpenHarmony / ohos 平台识别。

## 候选构成（实际 npm tgz，27 文件）

- `lib/`（24 个 JS + index.d.ts）：上游 lib + 5 个补丁，全部经真机验证。
- `package.json`：name=`@ohos-ports-electron/systeminformation`，version=`5.33.16-electron-oh.0`，
  `os` 含 `openharmony`/`ohos`，`repository.directory`=`ports/systeminformation/5.33.16`。
- `LICENSE`、`README.md`：上游原样。

## 配方文件（不入 npm 包）

| 文件 | 职责 |
| --- | --- |
| `patchs/0001..0005-*.patch` | 按序 git-am；基线为上游源码（非 npm tgz，其 lib 与源码有差异） |
| `build.sh` | bash 包装 → `electron-oh/tools/build.mjs`（锁源码输入 → 补丁 → 候选 tgz） |
| `publish.sh` | 默认禁发；CI 显式 `ENABLE_ELECTRON_OH_PUBLISH=1` 才放行（release.py 校验证据 ready 后 OIDC 发布） |
| `electron-oh/inputs.lock.json` | 基线、补丁、候选、运行时锁 |
| `electron-oh/tools/` | build.mjs、verify-candidate.cjs、release.py（候选校验+发布守卫） |
| `electron-oh/tests/` | regression.cjs（61 条共享断言宿主回归）、host-contract.py、dependencies.lock.json |
| `electron-oh/release-evidence.json` | 发行状态证据（ready/waivers/证据根） |

## 补丁

1. `0001`：17 模块把 `openharmony` 并入 linux 判定（BLK-01）。
2. `0002`：fsSize 用 `df -kP` + `/proc/mounts` 类型映射（BLK-02，toybox 兼容）。
3. `0003`：currentLoad 除零守卫、cpu 核数 `/proc/cpuinfo` 回退、versions.node 回退（BLK-04）。
4. `0004`：新增 `ohos` 平台分支（Electron-OH 40）。
5. `0005`：鸿蒙 app 域禁用同步 spawn（`execSyncCompat` 守卫）+ `/proc`,`/sys` 改 `fs.readFileSync`。

## 验证（详见第一阶段工程 reports/ 与 release-evidence.json）

| 目标 | baseline 5.33.1-beta.0 | candidate |
| --- | --- | --- |
| node（设备 Node 24.13.0） | 57/61 | 61/61（真机） |
| electron-reference（Electron-OH 37.2.0） | 57/61 | 61/61（真机） |
| electron34（Electron-OH 34.8.6） | 57/61 | 61/61（真机） |
| electron40（Electron-OH 40.0.1） | blocked | blocked（Electron-OH 40 运行时 SIGCHLD/waitpid 平台缺陷，官方源码注释坐实，非库问题） |

## 发行状态

**ready**：真机 node 24.13.0 / Electron-OH 37.2.0 / 34.8.6 各 61/61 通过；e40 依证据豁免
（Electron-OH 40 运行时 SIGCHLD/waitpid 平台缺陷，官方源码注释坐实，非库问题，详见
release-evidence.json 的 waivers；runtime 修复后补全量复测）。`publish.sh` 经 `release.py`
校验（证据 ready + 无 reasons + CI 环境五元组）后，以 npm Trusted Publishing（OIDC）发布
`latest`，发布后轮询 registry 校验 integrity。
