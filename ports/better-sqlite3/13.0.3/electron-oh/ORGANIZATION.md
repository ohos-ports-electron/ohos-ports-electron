# 组织仓库构建与发行入口

本目录维护 `@ohos-ports-electron/better-sqlite3`。`13.0.3-electron-oh.0` 已发布；
固定目标为 OpenHarmony arm64、Electron-OH 37.2.0、内置 Node 22.17.0、N-API 10。
原 Node 基线始终为 `@ohos-ports/better-sqlite3@13.0.3`。

## 文件与来源

| 位置 | 用途 |
| --- | --- |
| `../patchs/0001-update-package-json.patch`、`0002-openharmony-platform-support.patch` | 已有 Node 鸿蒙适配；构建基线使用 |
| `../patchs/0003-electron-oh-package.patch` | Electron 发行版本及 README 文件列表；目标 scope 由构建工具设置 |
| `build-electron-oh.sh` | 交叉构建与打包目录生成；在本仓库默认输出 `@ohos-ports-electron/better-sqlite3` |
| `pipeline/build.py` | 下载或导入固定 Node 基线，生成候选 tgz 和冻结的构建配方 |
| `pipeline/release.py prepare` | 导出自有 ports 配方、针对准确上游提交的补丁、同一个候选 tgz |
| `publish-electron-oh.sh`、`pipeline/release.py stage` | 默认只检查，显式开启后提交 npm 暂存审核 |
| `tools/`、`tests/`、三个 lock JSON | 原生编译、依赖导入、材料检查、包契约及发布检查 |
| `licenses/` | 按哈希锁定的完整许可证与 SDK notices |
| `reports/13.0.3-electron-oh.0/` | 历史发行证据、发布及 registry 元数据；保留原有哈希和报告链接 |
| 仓库根 `distribution/ohos-ports-electron/` | `.0` 独立 scope 的历史直接发布入口、profile 和授权材料 |

迁入来源：个人仓库 `mzsylr/ohos-ports` 的 Electron 分支提交 `48d13407384f838f278c679405af69a7c5f7b164`，
以及 GitCode 贡献材料仓库 <https://gitcode.com/OhosPortingSource/better-sqlite3> 中的
`electron-oh/13.0.3/ohos-ports/` 和 `distribution/ohos-ports-electron/`。
后者已提交的发行材料基于 `4c0023c`，两阶段工具在迁入时来自该本地工作区已暂存的后续改动。
保留原始输入锁与历史证据；不迁入下载缓存、完整运行时、HAP、私钥或 npm tgz。

本仓库保留 `../build.sh` 和 `../publish.sh` 作为原 Node port 入口。继承的 `.github/workflows/ci.yml`
限制为原 `ohos-ports/ohos-ports` 仓库运行；本组织使用下面的独立流程。

## 推荐的两阶段流程

需要 Python >=3.12、Node/npm、锁定的 OHOS NDK、shim 和 Electron 运行时。
先用 `python3 --version` 确认版本；若系统默认较旧，请把下文 `python3` 换成 `python3.12` 或更新版本。
Shell 入口支持通过 `PYTHON=/path/to/python3.12` 指定解释器。
构建命令在 `ports/better-sqlite3/13.0.3/electron-oh/` 下运行：

```bash
python3 pipeline/build.py \
  --ndk "$OHOS_NDK" \
  --shim "$ELECTRON_OH_SHIM" \
  --runtime-library "$ELECTRON_OH_RUNTIME_LIBRARY" \
  --output /path/to/new-build-bundle
```

没有本次候选的双宿主与签名证据时，构建可完成，发行状态保持 `blocked`。
使用冻结候选完成装机验证，按 `pipeline/README.md` 导入证据生成新的验证交接目录。
发布准备使用完整的上游提交 SHA：

```bash
python3 pipeline/release.py prepare \
  --bundle /path/to/validated-bundle \
  --ports-repo /path/to/upstream-ohos-ports \
  --ports-ref c46fc11a3891ba1cf823b85ffc9ce46af47b270b \
  --output /path/to/new-release

ELECTRON_OH_RELEASE_DIR=/path/to/new-release ./publish-electron-oh.sh
```

最后一条默认只检查。发行材料、候选包及运行证据都通过后，维护者若决定提交新版本，使用
`ENABLE_ELECTRON_OH_STAGE=1` 显式开启暂存上传，再在 npm 完成审批。
已有版本且制品 integrity 相同会返回 `already-published`；内容不同则拒绝。
不会改动 `latest` 标签或自动批准暂存包。

`.0` 仅用于已发布制品的复验。新的实际发行应先更新 `electron-oh.lock.json`、补丁 `0003` 及相关
绑定版本配置，例如 `13.0.3-electron-oh.1`，重新构建并验证；不能覆盖已发布的 `.0`。

## Actions 与本地检查

仓库根的工作流职责：

- `better-sqlite3-electron-oh-checks.yml`：公共 runner 执行源码、许可材料、发布保护与两阶段工具检查。
- `better-sqlite3-electron-oh-build.yml`：手动从组织仓库 `main` 运行，使用标签 `self-hosted, electron-oh`，生成 unsigned 测试候选。
- `better-sqlite3-electron-oh-two-stage.yml`：手动从组织仓库 `main` 构建及准备发行材料，构建 runner 标签为 `self-hosted, electron-oh-build`。

一个受信任 runner 可以同时具备上述两个自定义标签，配置 `OHOS_NDK`、`ELECTRON_OH_SHIM`、
`ELECTRON_OH_RUNTIME_LIBRARY`。这些工作流都没有 npm 上传步骤；不要在未审阅 PR 上运行特权构建。

```bash
python3 tools/check-release.py --check-materials
python3 tests/test-publication.py
python3 pipeline/test-pipeline.py
python3 tests/verify-package.py /path/baseline.tgz /path/candidate.tgz \
  --package-name @ohos-ports-electron/better-sqlite3
```

历史 `.0` 的 Node 10/10、Electron 18/18 结果来自迁入证据；本次迁移不代表重新执行过真机验证。
