# vscode-native-watchdog 1.4.6 · Electron-OH 构建与验证

## 从本目录独立构建

```bash
# CI 通道（托管原生归档，逐成员 sha256 校验）
bash ../build.sh --native-url "$WATCHDOG_NATIVE_URL" --output <dir> --verify

# 本地通道（阶段 01 工程的冻结产物）
bash ../build.sh \
  --native-dir "E:/jsAdaptPublish/vscode-native-watchdog 1.4.6/.local/base/build/addon" \
  --baseline "E:/jsAdaptPublish/vscode-native-watchdog 1.4.6/.local/baseline/vscode-native-watchdog-1.4.6.tgz" \
  --output <dir> --verify
```

流程：下载/校验基线 tgz（sha256 对 `inputs.lock.json`）→ 解包 → `git -c core.autocrlf=false apply`
0001 → apply 0002 → 双 ABI 原生成员哈希对账入包（`build/Release/watchdog.node` +
`electron-oh/watchdog.node`）→ `npm pack` → 三重哈希（tgz sha256 / gunzip tar sha256 / npm
integrity）与锁对账 → 输出 `candidate.tgz + manifest.json`。

阶段 01 冻结候选：tgz sha256 `8182dac569bc4b7eac20a30c0067640d7adc17d1881cb2684af51acf217ad4d0`。

## 原生二进制的两条供给路径

1. **托管归档（CI 发布通道）**：`native-artifact.lock.json` 锁定归档 sha256 与逐成员哈希；
   归档已托管于本仓 Release
   （`releases/download/vscode-native-watchdog-evidence-1.4.6-electron-oh.0/vscode-native-watchdog-native-1.4.6-electron-oh.0.tar.gz`，
   回下载 sha256 一致）。设置仓库变量 `WATCHDOG_NATIVE_URL` 指向该资产后 build 通道即通
   （变量为 admin 权限操作）。
2. **维护者重建**：`tools/build-addon.cjs --all`（需 `DEVECO_SDK_HOME`、node 24.13.0 headers、
   Electron-OH 37.2.0 electron-napi-library 的 headers + libshim.a；DevEco NDK 26.0.0.105 /
   clang 15.0.4）。重建产物哈希须与 `inputs.lock.json` 一致，否则视为配方漂移。

## 宿主兼容（CI compatibility 作业）

`tests/run-host.cjs --tgz <candidate.tgz>`：全新临时工程 `npm install` 同一 tgz——非 OHOS 平台
上 `install.cjs` 显式转交 `node-gyp rebuild` 从 `src/watchdog.cc` 源码编译（与上游
binding.gyp 自动检测的有效安装语义一致，同时验证该语义未被分发元数据破坏），随后运行
`tests/suite.cjs` 的 3 用例（与设备侧同一断言）。矩阵：Node 20.18.1 / 22.17.0 / 24.11.1 / 24.13.0。

## 发布

`../publish.sh`（默认禁发）→ `tools/release.cjs --bundle <dir> --execute`：
manifest 与当前 checkout 锁对账 → registry 幂等核对（同字节跳过 / 异字节拒绝 / 非 404 失败）→
上传同一 tgz（`--tag latest`）→ 补 `electron-oh` dist-tag。仅工作流在 main push、
`npm-publish` environment、OIDC 下调用。

## 一次性线上配置（合入前后由维护者完成）

1. 仓库变量 `WATCHDOG_NATIVE_URL`：原生归档已托管于本仓 Release（见
   `native-artifact.lock.json` distribution.url）；设置仓库变量指向该资产后 build 通道即通
   （Settings → Secrets and variables → Actions → Variables → New repository variable）
2. npm Trusted Publisher（按包独立配置，先发布正式版创建包身份）：
   `npm trust github @ohos-ports-electron/vscode-native-watchdog --repository ohos-ports-electron/ohos-ports-electron --file vscode-native-watchdog-electron-oh.yml --environment npm-publish --allow-publish`
   （npm >= 11.15.0；新配置 2 天内须完成首次真实发布）
3. `pages-deploy.yml` 的 workflow_run 白名单与 `ci.yml` legacy 排除清单已随本 PR 更新

## 设备验证证据（阶段 01，2026-10-31）

见 `release-evidence.json`（精简绑定）与单库工程完整报告（`reports/`、16 次冷启动原始日志、
handoff.json）。CI 不执行 fresh device 测试——宿主矩阵是回归，真机结论以精简证据为准。
