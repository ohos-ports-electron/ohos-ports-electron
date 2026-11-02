# @ohos-ports-electron/windows-foreground-love 0.6.1-electron-oh.0

HarmonyOS PC port of `windows-foreground-love@0.6.1`（上游 commit `c23c294`，MIT），native-extension（N-API，
**win32-only** 能力）。**零功能补丁**：API/导出面、平台契约、许可证与 Node 行为完全一致，
仅 `package.json` 分发元数据改为本 scope。

## 平台契约（关键）

非 win32 平台（含鸿蒙），`index.js` 平台守卫（`process.platform !== 'win32'`）直接短路返回 `false`、
**永不加载原生扩展**、不抛异常——上游对非 Windows 平台的显式设计契约（README「Other platforms: installs,
but doesn't do anything and always returns false」）。真实前台激活授权（`AllowSetForegroundWindow`/`ASFW_ANY`）
在鸿蒙无等价 API，由消费者架构级替换承接（`startAbility` / 目标应用自提升焦点）；本 port 交付 no-op 契约。

## 候选构成（实际 npm tgz，8 文件）

- `index.js`：纯 JS 入口（平台守卫 + 惰性加载原生扩展）——上游原样（未改字节）。
- `index.d.ts`、`binding.gyp`、`src/foreground-love.cc`、`src/common.h`：公开 API 声明 + node-gyp 构建源——
  上游原样（未改字节）。
- `package.json`：name=`@ohos-ports-electron/windows-foreground-love`，version=`0.6.1-electron-oh.0`，
  `repository.directory`=`ports/windows-foreground-love/0.6.1`，bugs 指向聚合仓库 issues；
  其余字段（main/typings/files/scripts/license/author/homepage）保留上游。
- `LICENSE`、`README.md`：上游原样。

全部 8 文件哈希见 `electron-oh/inputs.lock.json` 与第一阶段 `reports/package-contents.json`。

## 配方文件（不进入 npm 包）

| 文件 | 职责 |
| --- | --- |
| `patchs/` | 空——零功能补丁（补丁基线即 npm tgz，无源码差异） |
| `build.sh` | bash 包装 → `electron-oh/tools/build.cjs`（锁定基线 tgz → 元数据改写 → 候选 tgz） |
| `publish.sh` | 默认禁发；CI 显式 `ENABLE_ELECTRON_OH_PUBLISH=1` 才放行（release.py 校验证据 ready + CI 五元组 → OIDC 发布） |
| `electron-oh/inputs.lock.json` | 基线、候选、运行时锁定 |
| `electron-oh/tools/` | build.cjs、suite.cjs、verify-candidate.cjs、release.py（候选校验 + 发布守卫） |
| `electron-oh/tests/` | assertions.cjs（2 条共享断言）、regression.cjs、host-contract.py、dependencies.lock.json |
| `electron-oh/release-evidence.json` | 发行状态证据（ready，四角色真机 2/2 ×2） |

## 构建交接 vs 最终 candidate.tgz

`build.sh` 在 CI 一次构建，把 **`candidate.tgz` + `meta.json`** 作为 artifact 交接；发布 job 下载同一 artifact，
由 `release.py` 核验候选 SHA256 == `inputs.lock.json` 与 `release-evidence.json`，**上传同一 tgz，不重新 pack**。
Electron 引擎（libelectron.so）、HAP、SDK 不属于库 npm 包——设备证据与运行时来源只记录在 lock/evidence，
不进入本 port 提交。宿主供给的占位 addon（`foreground_love.node`，node/electron 双 ABI，NAPI 8）为设备验证的
运行时供给（非库补丁、不入候选包），4 目标装载探针真机通过。

## 安装依赖 vs 测试依赖锁

- 库 npm 包**零运行时依赖**（上游 `dependencies` 为空）。
- 库含 `binding.gyp`：npm 默认 install 触发 `node-gyp rebuild`（win32 真实 addon / 其他平台占位编译）。
  addon 在非 win32 平台永不加载，鸿蒙侧消费经 tarball 装配或 `--ignore-scripts` 即可（设备矩阵已实证）。
  宿主契约回归（`tests/host-contract.py`）如实以 `--ignore-scripts` 安装并仅验证 JS 契约。
- `devDependencies` 为空；host-contract 用 `tests/dependencies.lock.json`（`file:./candidate.tgz`）做安装回归。
- 所有文件 LF 行尾；无 Windows 专属文件入包、无预编译二进制入包（addon 为 win32 平台 node-gyp 构建产物）。

## 验证（详见第一阶段工程 reports/ 与 release-evidence.json）

| 目标 | baseline 0.6.1 | candidate |
| --- | --- | --- |
| node（设备 Node 24.13.0） | 2/2 ×2 | 2/2 ×2（真机） |
| electron-reference（Electron-OH 37.2.0） | 2/2 ×2 | 2/2 ×2（真机） |
| electron34（Electron-OH 34.8.6） | 2/2 ×2 | 2/2 ×2（真机） |
| electron40（Electron-OH 40.0.1） | 2/2 ×2 | 2/2 ×2（真机） |

名册 2 条 = 上游 `test/test.js` 非 win32 分支断言（有参/无参均恒 `false`、不崩溃）；win32 专属两条（真实授权
`true`）为 platform_exclusive 剔除（上游设计契约，鸿蒙无等价 API）。

## 发行状态

**ready**：候选哈希 `a82ae91f...` 与 inputs.lock / release-evidence 绑定一致；四必需角色设备证据齐全。
CI 经 `.github/workflows/windows-foreground-love-electron-oh.yml` 的 build → compatibility（Node 20.18.1/22.17.0/24.11.1/24.13.0）→
publish（仅 main push，environment `npm-publish`，OIDC）发布 `latest`，发布后轮询 registry 校验 integrity。
线上 Trusted Publisher 为按包的一次性 npm 账号配置（`npm trust github @ohos-ports-electron/windows-foreground-love ...`），
普通提交无法创建，需维护者完成 2FA。**尚未发布到 registry**（本地贡献材料，见 `docs/RELEASING.md` 与第一阶段 `pr/`）。
