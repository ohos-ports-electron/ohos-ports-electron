# better-sqlite3 两阶段发行试点

范围固定为上游 better-sqlite3 13.0.3、鸿蒙 Node 基线 13.0.3、Electron-OH 37.2.0。
默认目标是 `@ohos-ports-electron/better-sqlite3`；已有 `.0` 已发布，重复运行只核对内容，不能覆盖它。
本次保留 `.0` 以复验历史产物；准备新的实际发行前，先按下文同步适配修订号（例如 `.1`），再开始新构建。
这是该版本的可移植试点；扩展其他库时需要各自的输入锁、构建适配器、包契约和双宿主用例。

| 阶段 | 输入 | 输出 | 完成条件 |
| --- | --- | --- | --- |
| 构建 `build.py` | 本地 electron-oh 适配目录、已发布 Node tgz、锁定 SDK/shim/运行时 | `build-bundle/`：候选 tgz、基线、配方快照、文件哈希、可选验证证据 | 包契约通过；允许先生成待装机验证的候选 |
| 发布准备 `release.py prepare` | 冻结构建目录、准确的 ohos-ports 提交 | 自有 ports 目录、上游补丁、同一个 tgz、`release.json` | 补丁可应用，所有交接文件哈希一致 |
| 发布提交 `release.py stage` | 已准备的发行目录、运行验证及签名/许可证证据 | 默认只检查；显式 `--execute` 才提交 npm 暂存审核 | 发行检查通过，版本尚未占用，维护者随后审批 |

发布阶段不编译、不安装构建依赖、不执行 `npm pack`，也不自动批准暂存包。
每个阶段在新目录中输出，不能原地编辑冻结目录；哈希用于检测交接变化，不代替维护者审批或可信 CI 的来源证明。
可安装 npm 包仍含基线 JS、原 Node 预编译文件，以及新增 Electron `.node`，不是要求使用者手工应用的二进制差分。
`ports.patch` 则只含构建配方、输入锁、文档、许可证和验证工具，不携带整套库源码、NDK、运行时或 HAP。

## 一、构建

需要 Python >=3.12、npm、Node，以及现有适配文档列出的 NDK、shim、Electron 运行时。
使用 Python 3.12+ 的环境运行下列 `python3`；输入哈希、来源及签名路线沿用相邻的三个 lock 文件。
以当前 `electron-oh/` 为工作目录：

```sh
python3 pipeline/build.py \
  --ndk "$OHOS_NDK" \
  --shim "$ELECTRON_OH_SHIM" \
  --runtime-library "$ELECTRON_OH_RUNTIME_LIBRARY" \
  --output /tmp/better-sqlite3-build
```

默认下载并校验 `@ohos-ports/better-sqlite3@13.0.3`，也可用 `--baseline /path/baseline.tgz` 离线导入同哈希缓存。
构建使用 `--for-hap-distribution`：由消费应用在打 HAP 时完成代码签名。
不会改动原 Node 加载入口或覆盖 `prebuilds/openharmony-arm64.node`。
输出包与原包逐文件比较，并运行 9 个不兼容/篡改反例检查。

首次构建缺少真实装机证据时，`releaseReadiness` 是 `blocked`，但候选构建可以完成。
使用该目录中的 `artifacts/candidate.tgz` 跑独立 Node 和 Electron HAP demo；签名验证与报告按
`release-evidence.example.json` 填写，必须绑定该 tgz 和 ELF 的准确哈希。
随后导入同一候选和**首次冻结的适配目录**，生成已验证的构建交接件：

```sh
python3 pipeline/build.py \
  --adapter /tmp/better-sqlite3-build/adapter/ports/better-sqlite3/13.0.3/electron-oh \
  --baseline /tmp/better-sqlite3-build/artifacts/baseline.tgz \
  --import-candidate /tmp/better-sqlite3-build/artifacts/candidate.tgz \
  --evidence /path/release-evidence.json \
  --reports-dir /path/reviewed-public-reports \
  --output /tmp/better-sqlite3-validated
```

导入模式明确记录 `imported-validated-candidate`，不声称重新编译或重新装机。
只导入可公开报告，签名私钥、账户凭据及本机配置不能放进交接件。
报告 URL 仍需人工审阅；脚本只校验声明、绑定哈希和发行约束。

## 二、发布准备与审核提交

先在本地取得官方 ohos-ports 准备贡献到的基线提交。必须传完整 SHA，不能把会移动的 `main` 当发行身份：

```sh
python3 pipeline/release.py prepare \
  --bundle /tmp/better-sqlite3-validated \
  --ports-repo /path/to/ohos-ports \
  --ports-ref c46fc11a3891ba1cf823b85ffc9ce46af47b270b \
  --output /tmp/better-sqlite3-release
```

输出目录含义：

```text
release.json                              # 全量文件哈希、构建身份、上游提交和就绪状态
build-bundle/                             # 完整冻结交接件
  artifacts/{baseline,candidate}.tgz       # 原始字节，无二次打包
repository/ports/better-sqlite3/13.0.3/     # 自有 ports 仓库可提交内容
  port.json                               # 包名/版本、基线、目标提交、候选哈希
  build.sh                                # 独立构建入口
  publish.sh                              # 独立审核提交入口，开关默认关闭
  patchs/0003-electron-oh-package.patch
  electron-oh/                            # 实现、锁、文档、许可证、测试和两阶段工具
upstream-overlay/ports/.../                # 给官方 ohos-ports 的增量
better-sqlite3-13.0.3-electron-oh.0.ports.patch
release-preflight.json
```

向自有 Electron ports 仓库提交 `repository/` 中的配方；候选 tgz 与报告通过 CI artifact 或版本附件携带。
提交正式 PR 到官方仓库时用 `upstream-overlay/` 或 `git apply` 应用 `.ports.patch`，
它保留官方 Node `build.sh`、`publish.sh`、`0001/0002`，不会让 Node 的默认 CI 路径切到 Electron。
两套根入口用途不同，不要直接把自有仓库的根入口覆盖进官方 Node port。
版本补丁包含该版可复现配方，`0003` 只承担 npm 元数据/文件列表调整；本次没有新增库 C++/JS 逻辑补丁。

执行只读检查：

```sh
python3 pipeline/release.py stage --release /tmp/better-sqlite3-release
```

已存在且 SHA512 integrity 相同则返回 `already-published`；同版本不同内容直接拒绝。
只有确认 npm 返回 E404、发行材料检查通过并显式执行下列命令，才上传暂存：

```sh
python3 pipeline/release.py stage --release /tmp/better-sqlite3-release --execute
```

暂存采用 `npm stage publish candidate.tgz --ignore-scripts --access public --tag electron-oh`，
要求 npm >=11.15.0、Node >=22.14.0；使用发行环境已有的认证，不保存 token。
当前本机 npm 11.11.0 可以完成构建、准备和只读核对；未来上传新版本前需升级发行环境。
维护者通过 npm 的暂存审核页面或官方审批命令完成二次认证和上线。
工具不会自动修改 `latest`，不会绕过原组织权限，也不把“上传暂存成功”视为“已公开发布”。
参考：[npm stage](https://docs.npmjs.com/cli/v11/commands/npm-stage/)、[Staged publishing](https://docs.npmjs.com/staged-publishing/)。

自有 ports 根 `publish.sh` 另要求 `ELECTRON_OH_RELEASE_DIR` 指向准备好的发行目录；
默认只读检查，只有 `ENABLE_ELECTRON_OH_STAGE=1` 才传 `--execute`。
CI 推荐分开构建与发行 job：构建 job 不配置发布凭据，上传完整冻结目录；
发行 job 下载后校验并生成配方/补丁，受保护的人工入口才提交暂存。
组织仓库已接入 `.github/workflows/better-sqlite3-electron-oh-two-stage.yml`；本目录的 `ci-two-stage.yml` 保留作可移植示例。
仓库内直接使用 `../publish-electron-oh.sh` 作为 Electron 暂存入口，原 Node `../publish.sh` 不参与此流程。

## 三、后续版本与测试

原库仍为 13.0.3，只修适配配方或二进制时使用 `13.0.3-electron-oh.1`、`.2`。
修改 `electron-oh.lock.json` 与 `patchs/0003-electron-oh-package.patch` 的发行版本，
以及本库其他仍绑定该发行号的测试/示例配置；不要对现有 tgz 改版本再发布，必须构建新候选、重新绑定并审核运行证据。
上游库升级时新建对应 `ports/<库>/<上游版本>/` 并重新锁定线上基线、源码与 SDK 输入。

```sh
python3 pipeline/test-pipeline.py
python3 pipeline/test-pipeline.py --release /tmp/better-sqlite3-release
```

第二条还测试候选完整性、缺失证据、E401/网络错误、重复版本、默认禁传、旧 npm 拒绝和准确暂存命令。
这些上传分支使用 mock，不连接 npm 上传接口。
