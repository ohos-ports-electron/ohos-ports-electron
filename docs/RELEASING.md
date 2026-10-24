# 构建与自动发布

本仓库发布 scope 为 **@ohos-ports-electron**。当前自动发行接入 vscode-deviceid；继承的其他上游 ports 保留为构建检查，不自动向任何 scope 发布。将它们迁入新 scope 前还需各自的 Electron 验证、包名/依赖审查和 npm Trusted Publisher 配置。

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
