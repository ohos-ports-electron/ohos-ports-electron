# @ohos-ports-electron/vscode-textmate 9.3.2-electron-oh.0

HarmonyOS PC port of `vscode-textmate@9.3.2`（上游 commit `392b23a`），pure-runtime（纯 JS、
零 npm 运行时依赖）。**零功能补丁**：公开 API 面（webpack bundle `release/main.js` 的 6 个顶层
导出 + Registry/IGrammar 实例方法）、许可证与 Node 行为完全一致，仅 `package.json` 分发元数据改为本 scope。
oniguruma 正则引擎按上游公开契约由宿主经 `RegistryOptions.onigLib` 注入，不在本包内（见「onigLib 供给」）。

## 候选构成（实际 npm tgz 共 5 文件）

- `release/main.js` / `LICENSE.md` / `README.md` / `types/vscode-textmate.d.ts`：上游原样（未改字节）。
- `package.json`：name=`@ohos-ports-electron/vscode-textmate`，version=`9.3.2-electron-oh.0`，
  `repository.directory`=`ports/vscode-textmate/9.3.2`，bugs 指向聚合仓库 issues；其余字段
  （main/typings/files/author/license/scripts/devDependencies）保留上游。

全部 5 文件哈希见 `electron-oh/inputs.lock.json` 与第一阶段 `reports/package-contents.json`。

## 配方文件（不进入 npm 包）

| 文件 | 职责 |
| --- | --- |
| `patchs/` | 空——纯 JS 零功能补丁（补丁基线即 npm tgz，无源码差异） |
| `build.sh` | bash 包装 → `electron-oh/tools/build.cjs`（锁定基线 tgz + 元数据改写 → 候选 tgz） |
| `publish.sh` | 默认禁发；CI 显式 `ENABLE_ELECTRON_OH_PUBLISH=1` 才放行（release.py 校验证据 ready + CI 五元组 + OIDC 发布） |
| `electron-oh/inputs.lock.json` | 基线、候选（tgz + 规范 tar 双哈希）、运行时与 onigLib 供给锁定 |
| `electron-oh/tools/` | build.cjs、suite.cjs、verify-candidate.cjs、release.py（候选校验 + 发布守卫） |
| `electron-oh/tests/` | assertions.cjs（9 条公开 API 共享断言）、regression.cjs、host-contract.py、dependencies.lock.json |
| `electron-oh/release-evidence.json` | 发行状态证据（ready，四角色真机 9/9 ×2） |
| `electron-oh/PACKAGE_README.md` | 面向 npm 使用者的包说明 |

## 构建交接 vs 最终 candidate.tgz

`build.sh` 在 CI 一次构建，以 **`candidate.tgz` + `meta.json`** 作为 artifact 交接；发布 job 下载同一 artifact，
经 `release.py` 核验候选 SHA256 == `inputs.lock.json` == `release-evidence.json`，**上传同一 tgz，不重新 pack**。
Electron 引擎（libelectron.so）、HAP、SDK、oniglib addon 不属于库 npm 包——设备证据与运行时来源只记录在
lock/evidence，不进入本 port 提交。

## onigLib 供给（本库特有）

vscode-textmate 上游即不捆绑 oniguruma（VS Code / Shiki 等使用方自行注入 `IOnigLib`）：

- **真机验证**（第一阶段）：本地交叉编译 `oniglib` N-API addon（oniguruma 6.9.8，node/electron 双 ABI，
  NAPI_VERSION=8），随 demo 装配注入——运行时宿主供给、非库补丁；双 ABI 在 4 目标真机加载验证通过。
- **CI 宿主回归**（本仓库）：`vscode-oniguruma` WASM（上游自身测试引擎，锁定 1.7.0，纯测试依赖）。
- 两种供给满足同一 `IOnigLib` 公开契约，不改变候选字节。

## 安装依赖 vs 测试依赖锁

- 库 npm 包**零运行时依赖**（上游 `dependencies` 为空）。
- 上游 `devDependencies`（vitest/webpack/typescript 等）仅为上游构建测试需要，不打进候选；
  host-contract 按 `tests/dependencies.lock.json`（`file:./candidate.tgz` + `vscode-oniguruma@1.7.0`）做普通安装回归。
- 所有文件 LF 行尾；无 Windows 专属文件、无原生二进制入包。

## 验证（详见第一阶段工程 reports/ 与 release-evidence.json）

| 目标 | baseline 9.3.2 | candidate |
| --- | --- | --- |
| node（设备 Node 24.13.0） | 9/9 ×2 | 9/9 ×2（真机） |
| electron-reference（Electron-OH 37.2.0） | 9/9 ×2 | 9/9 ×2（真机） |
| electron34（Electron-OH 34.8.6） | 9/9 ×2 | 9/9 ×2（真机） |
| electron40（Electron-OH 40.0.1） | 9/9 ×2 | 9/9 ×2（真机） |

名册为 9 条公开 API 用例（parseRawGrammar 解析/异常、loadGrammar+tokenizeLine scopes、tokenizeLine2
编码 token、未知 scope 拒绝、跨行状态栈持久化+diff/apply、setTheme/getColorMap、addGrammar、
INITIAL/disposeOnigString）。本地适配目录的 268 条内部模块名册依赖 `out/src/*` 与 `test-cases/`，
npm 发布布局不含，故按公开 API 面重建名册。electron25 由调用方明确移出范围（Electron-OH 无官方 v25 发行物）。

## 发行状态

**ready**：候选哈希 `1e7e8eed...` 与 inputs.lock / release-evidence 绑定一致；四必需角色设备证据齐全。
CI 由 `.github/workflows/vscode-textmate-electron-oh.yml`：build → compatibility（Node 20.18.1/22.17.0/24.11.1/24.13.0）→
publish（仅 main push，environment `npm-publish`，OIDC）发布 `latest`，发布后轮询 registry 校验 integrity。
线上 Trusted Publisher 为按包的一次性 npm 账号配置，普通提交无法创建，需维护者完成。
