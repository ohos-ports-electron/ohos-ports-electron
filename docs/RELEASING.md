# 构建与自动发布

本仓库发布 scope 为 **@ohos-ports-electron**。当前自动发行接入 vscode-deviceid 和下文的 onnxruntime-node 独立流程；继承的其他上游 ports 保留为构建检查，不自动向任何 scope 发布。将它们迁入新 scope 前还需各自的 Electron 验证、包名/依赖审查和 npm Trusted Publisher 配置。

## 两阶段与触发条件

1. PR 中或本地做适配：更新准确基线上的补丁、输入锁、构建脚本和精简验证证据。完整 demo/报告放单库仓库；不提交运行时缓存、私钥、签名 profile 或 HAP。
2. `.github/workflows/npm-publish.yml` 先构建一次，再由 Node 20.18.1 / 22.17.0 / 24.11.1 / 24.13.0 作业安装同一 tgz 并验证。构建产物通过 Actions artifact 交接，发布作业重新核验哈希与仓库配方。
3. 只有本仓库 **push 到 refs/heads/main**，构建和全部兼容检查通过后，进入 `npm-publish` environment，执行直接 `npm publish --tag latest --provenance`。合入 PR 属于 main 的 push；PR、其他分支、Fork 和手动 workflow_dispatch 都不能发布。
4. 发布脚本再检查事件、仓库、分支、工作流路径和 checkout SHA；默认本地包装器不开启发布。没有 NPM_TOKEN，使用 GitHub-hosted runner 的短时 OIDC 身份。
5. 同版本同字节已在 registry 中时跳过上传；不同字节拒绝覆盖；除 404 外的 registry 错误一律失败。新版本发布后读取 registry 核对 integrity。

`latest` 是本自动流程唯一更新的通道，保证默认 npm install 获取新版本；历史 `electron-oh` 标签不自动维护。版本号仍使用 `0.1.5-electron-oh.N`。npm 包内的 publishConfig 保留历史 electron-oh 默认值，自动流程显式 CLI `--tag latest` 覆盖它，避免为仅调整发布策略而改变已验证的 tgz。

## 一次性配置

GitHub：创建 environment `npm-publish`，deployment branch policy 仅允许 `main`，不设置 required reviewers（否则每次发布需人工批准）。workflow 发布 job 单独授予 `id-token: write`、`contents: read`，构建及 PR job 仅只读权限。建议另外启用 main 分支保护和必需的 CI 检查。

npm 包 Settings → Trusted publishers：

| 字段 | 值 |
| --- | --- |
| Provider | GitHub Actions |
| Organization/user | ohos-ports-electron |
| Repository | ohos-ports-electron |
| Workflow filename | npm-publish.yml |
| Environment | npm-publish |
| Allowed action | npm publish（直接发布，而非仅 stage publish） |

也可使用支持 Trusted Publishing 的 npm CLI：

```sh
npm trust github @ohos-ports-electron/vscode-deviceid \
  --repository ohos-ports-electron/ohos-ports-electron \
  --file npm-publish.yml --environment npm-publish --allow-publish --yes
```

此项是 npm 账号权限配置，普通代码提交本身无法创建；包维护者需完成 npm 二次认证。不要把本机 token 搬入 GitHub。参考 [npm 官方 Trusted Publishing 文档](https://docs.npmjs.com/trusted-publishers/)。
使用锁定的 Node 24.13.0 / npm 11.21.0；不要在 Harmony 容器或 self-hosted runner 中假设支持该 OIDC 身份。

首次合入 `.1` 时，若复现已发布字节，输出 already-published 是正常结果，不生成新的来源证明。首次真实的新版本上传才能验证端到端 OIDC 权限。npm 当前要求新 Trusted Publisher 配置在两天内完成首次发布；若超期需重新配置，因此应在已准备好新修订号和设备证据、临近合入时启用。不能以 PR 通过或跳过旧版本代替“自动上传已验证”。

## 发布新修订

更新该 port 的 0002 分发补丁版本、inputs.lock.json 的版本及补丁 SHA256；重新构建并验证真实 Node / Electron 环境。把对应候选 SHA256 和精简设备报告更新到 release-evidence.json，并更新测试依赖锁中的版本/integrity。不同版本或不同候选不得套用旧报告。

提交 PR → CI 构建/兼容检查 → 审查合入 main → CI OIDC 自动发布 latest → registry integrity 验证。发布失败可重跑同一个 main 提交，已有同字节版本会幂等跳过；不需要离线打包上传。变更分发文件或 npm pack 字节时必须递增版本。

## onnxruntime-node 的独立原生流程

`ports/onnxruntime-node/1.27.0` 使用独立工作流 `onnxruntime-node-electron-oh.yml`，不改变 vscode-deviceid 的 npm-publish.yml。候选为 `@ohos-ports-electron/onnxruntime-node@1.27.0-electron-oh.1`；environment 为 `npm-publish`，通道为 `latest`。

PR 运行托管静态/信任边界、同包构建和五版本宿主兼容检查，不接触发布 Secret。main push 或 main 手动运行也在 Ubuntu 24.04 托管机下载 `ONNXRUNTIME_NATIVE_URL`，用 native-artifact.lock.json 校验归档和三个成员，再组合锁定基线生成同一 tgz；不需要自建 runner，不在 CI 重编原生库。构建一次后交接给 Node **18.15.0 / 20.18.1 / 22.17.0 / 24.11.1 / 24.13.0** 宿主矩阵。手动运行仅构建验证；发布仅允许可信 main push，等待全部兼容作业与 release ready。

功能证据覆盖 Electron-OH **25、34、37、40、独立 Node**。独立 Node 官方归档来源和设备 npm CLI 补充结果见精简证据。完整证据及冻结原生归档已 HTTPS 托管并回下载校验，实际 URL/SHA256 已绑定。首次 bootstrap CI 上传已于 2026-10-28 完成，latest 为 `1.27.0-electron-oh.1`，公开 registry 的 integrity、回下载 tgz 及全部 72 文件与设备冻结候选相符。PR/main 的五版本宿主矩阵均已实际运行，每版本 20/20；无 fresh device CI，不能把 Linux 宿主矩阵当作设备重测。首次 Token 上传与后续 OIDC 授权验证分开记录。

### 首次 CI 自动发包

若 npm 包确实尚未创建，可使用一次性 bootstrap 模式。拥有 scope 创建/发布权限的维护者在 npm 网站创建短期 Granular Access Token，允许目标 scope/package 的 Read and write，并启用 Bypass 2FA；只添加组织管理权限不足以发布包。将 Token 存入 GitHub **npm-publish environment Secret `NPM_BOOTSTRAP_TOKEN`**，将仓库变量 **`ONNXRUNTIME_PUBLISH_MODE=bootstrap`**。不在聊天、源码或制品里传 Token。

核对证据归档与原生归档在线可下载，填写证据 URL/SHA，仓库变量 **`ONNXRUNTIME_NATIVE_URL`** 指向锁定原生归档。完成本地门禁和审查后，由 main 的可信 push 触发 build → 五版本 compatibility → publish。发布脚本再次认证查询包不存在；若包已存在则 bootstrap 拒绝。同版本同 integrity 已发布会幂等跳过，不能用跳过上传证明认证已验证。

首发成功后核对 registry integrity 和 latest，删除 `NPM_BOOTSTRAP_TOKEN`，将 `ONNXRUNTIME_PUBLISH_MODE` 改回 `oidc`。Token 首发和后续 OIDC 是两种独立认证；Token 不能代替后续 Trusted Publisher 的实际上传验证。

### 后续 OIDC

本包 Trusted Publisher 单独配置：owner **ohos-ports-electron**、repository **ohos-ports-electron**、workflow filename **onnxruntime-node-electron-oh.yml**、environment **npm-publish**，显式允许 direct `npm publish`。已有 vscode-deviceid 授权不会自动授权本包。该包已存在后，由包维护者完成账户 2FA：

```sh
npm trust github @ohos-ports-electron/onnxruntime-node \
  --repository ohos-ports-electron/ohos-ports-electron \
  --file onnxruntime-node-electron-oh.yml --environment npm-publish --allow-publish
```

按 [npm Trusted Publishing 文档](https://docs.npmjs.com/trusted-publishers/)，使用 GitHub 托管 runner，Node >=22.14.0 / npm >=11.5.1；`npm trust` 命令要求 npm >=11.15.0。本流程固定 Node 24.13.0 / npm 11.21.0。新配置应在两天内完成首次真实发布，临近下一个已验证新修订才创建；PR 静态检查或跳过旧版本不能证明 OIDC 上传成功。首发 Token 官方依据：[创建 Token](https://docs.npmjs.com/creating-and-viewing-access-tokens/)、[CI 中使用 Token](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow/)。

线上核查已确认 `npm-publish` environment 存在且部署分支为 main，维护者已配置首发 Secret 并完成首次上传；Token 不进入 Git。后续新修订仍需本包独立的 Trusted Publisher 授权及首次 OIDC 真实上传验收；同版本跳过不能代替这项验证。线上执行状态以对应 PR/Actions 和 registry 验收为准。详见 [ONNX 配方 README](../ports/onnxruntime-node/1.27.0/README.md) 与 [构建步骤](../ports/onnxruntime-node/1.27.0/electron-oh/README.md)。
