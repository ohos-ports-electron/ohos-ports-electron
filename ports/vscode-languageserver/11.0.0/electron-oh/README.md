# electron-oh 目录说明

本目录是 `@ohos-ports-electron/vscode-languageserver@11.0.0-electron-oh.0` 的发行配方与证据。

- `inputs.lock.json`：锁定基线 npm tgz（sha256/integrity）、候选（name/version/sha256/
  integrity/archiveUrl）、测试供给（vscode-languageserver-textdocument@1.0.16）、上游文件哈希
  与发行身份（repository / requiredDistTags latest+beta）。
- `package-inventory.json`：候选包内 58 文件逐项 SHA256（= build manifest `files`）。
- `PACKAGE_README.md`：进入候选包的 README（上游 README 改存 `README.upstream.md`）。
- `release-evidence.json`：发行状态（ready）、候选哈希、四角色 × 双阶段设备报告哈希与
  冷启动 PID、证据归档 URL/SHA。
- `tools/build.py`：确定性 USTAR+gzip 构建候选（元数据/README 改写 + 冻结归档兜底）。
- `tools/release.py`：候选校验、CI 宿主回归、OIDC 发布（`--tag beta` + latest/beta 双标签）。
- `tests/`：suite.cjs（24 条公开 API 断言）、cases.json（名册）、run-suite.cjs（OHPTCASE
  协议）、release-contract.py（发布守卫合成拒检）。

关键发行约束（`release.py guard`）：仅 `ohos-ports-electron/ohos-ports-electron` 仓库
`push` 到 `main`、`npm-publish` environment、本 workflow 身份、`ENABLE_ELECTRON_OH_PUBLISH=1`
才放行发布；npm 上传用 Trusted Publisher/OIDC，dist-tag 为独立权限。
