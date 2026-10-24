# vscode-deviceid 0.1.5：Node / Electron-OH

目标包：`@ohos-ports-electron/vscode-deviceid@0.1.5-electron-oh.0`，dist-tag `electron-oh`。
基线是已发布的 `@ohos-ports/vscode-deviceid@0.1.5-beta.0`，不是假定存在的 `0.1.5` npm 版本。
这是文件中持久化的随机 UUID，不是设备硬件 UDID。

## 对比结论

| 项目 | 线上鸿蒙包 | 本地已适配结果 / 本次增量 |
| --- | --- | --- |
| 平台入口 | 接受 win32/darwin/linux/freebsd/openharmony | 本地还接受 ohos；本次把该增量打成可应用补丁 |
| 存储路径 | openharmony 使用 XDG_CACHE_HOME 或 HOME/.cache，加 Microsoft/DeveloperTools | ohos 沿用相同路径；原分支保持不变 |
| 设备 ID 核心 | 缓存读取、UUID v4、BOM 去除并尽力重写 | 本地 devdeviceid.js 与线上逐字节相同；不是新增功能 |
| 构建目录 | npm 的 dist/ | 本地工具产物为 dist/lib/；本次按线上 dist/ 布局应用增量，避免入口错位 |
| 原生部分 | binding.gyp / src/windows.cc 仅服务 Windows 注册表 | 鸿蒙走纯 JS；无需 Electron ABI 重编译、.node、libshim.a 或 NDK 交叉编译库本身 |
| 安装 | 无显式 install，存在 binding.gyp，npm 可隐式 node-gyp rebuild | 新增平台隔离安装脚本，仅 Windows 执行原生构建；鸿蒙普通 npm install 可用 |
| 类型与依赖 | 三个 .d.ts，fs-extra ^11.2.0、uuid ^14.0.0 | 类型及依赖声明保留；实际验证用的传递依赖由 demo dependency-lock.json 固定记录 |
| 分发 | 原 @ohos-ports scope / beta.0 | 独立 @ohos-ports-electron scope / electron-oh.0，原包和 tag 不修改 |

本次 Electron-OH 37.2.0 真机报告的 process.platform 是 `openharmony`：线上平台判断已涵盖该值。
因此增量的价值是补齐 `ohos` 兼容、免除无关安装构建、形成双宿主验证和发行记录；
不能把它描述成原包在所有 Electron-OH 环境都不能运行。

## 文件职责

- `../patchs/0001-ohos-platform-alias.patch`：针对准确线上包的 dist/index.js 和 dist/storage.js 增加 ohos。
- `../patchs/0002-electron-oh-distribution.patch`：包名、修订号、仓库、publishConfig 和 install 入口。
- `local-source-reference.patch`：原本地 TS 源码补丁，供溯源；线上 tgz 不含这些 TS 文件，不对 tgz 重复应用它。
- `inputs.lock.json`：线上包 URL/SHA256/SHA512、补丁哈希和验证目标；不能只依赖会变化的 latest。
- `install.cjs`：Windows 才调用 node-gyp；保留 Windows 源码但未在 Windows 真机验证。
- `PACKAGE_README.md`：随 npm 包携带的 Electron 接入说明。
- `tools/workflow.py`：阶段一生成并冻结 tgz；阶段二校验双宿主证据、导出 ports 目录并发布同一个 tgz。
- `demos/`：独立 Node HNP、Electron 主进程/隔离 renderer、共享十项断言及构建签名/冷启动验证入口。
- `tests/host-contract.py`：普通安装、宿主功能与平台模拟、基线行为对照、交接篡改及默认禁发检查。
- `reports/`：本次实际验证/签名日志与发行记录，不提交密钥、单独设备 profile 或完整运行时。
- `../build.sh`、`../publish.sh`：独立入口；发布默认关闭，避免原仓库自动 CI 意外上传。

## 两阶段流程

在仓库根运行，需 Python >=3.12、Node/npm、patch、git。库本身只应用 JS/元数据补丁并 npm pack。

```sh
bash ports/vscode-deviceid/0.1.5/build.sh --output "$PWD/.local/new-build"
```

可用 `--baseline /absolute/path/baseline.tgz` 导入缓存，仍校验准确哈希。
构建输出含 baseline.tgz、candidate.tgz、recipe/、comparison.json、bundle.json。
原包 16 个文件中只有 package.json 和两个平台判断 JS 改动，其余 13 个保持原字节；新增 3 个文件。
冻结后不可原地编辑；修订源码或版本后应输出到新目录。

使用该 candidate.tgz 生成并装机验证两个 demo，详见 [demos/README.md](demos/README.md)。
验证通过后准备发行材料：

```sh
python3 ports/vscode-deviceid/0.1.5/electron-oh/tools/workflow.py prepare \
  --bundle .local/new-build \
  --node-report .local/verification/node \
  --electron-report .local/verification/electron \
  --output .local/new-release
```

输出 `ports/vscode-deviceid/0.1.5/` 版本配方、冻结 tgz、双宿主证据和 release.json 全量文件清单。
提交 ports 目录到本仓库，编译/运行资源留在本地或 CI artifact。发布阶段不重编译、不重新 npm pack。

```sh
# 只读检查，不上传；同版本同字节则幂等返回 already-published。
python3 ports/vscode-deviceid/0.1.5/electron-oh/tools/workflow.py publish --release .local/new-release

# 经双宿主验证、签名检查和版本冲突检查后，明确上传。
python3 ports/vscode-deviceid/0.1.5/electron-oh/tools/workflow.py publish --release .local/new-release --execute
```

本仓库所有者的本地发行使用 npm publish --tag electron-oh，并完成 npm 要求的二次认证。
原全局 CI 即使调用本 port 的 publish.sh，默认也只输出禁发提示。
若通过包装器发行，必须同时设置 ENABLE_ELECTRON_OH_PUBLISH=1 和 ELECTRON_OH_RELEASE_DIR。
不写入 npm token，不改原组织包；已发布版本不能覆盖，后续适配修订用 `.1`、`.2` 并重新验证。
未来接入上游维护者的 npm 暂存审核流程时，应使用受保护的独立发行环境；不能把上传成功当成已公开。

## 验证与适用边界

```sh
python3 ports/vscode-deviceid/0.1.5/electron-oh/tests/host-contract.py --bundle .local/new-build
```

独立 CI `.github/workflows/vscode-deviceid-electron-oh-checks.yml` 无上传步骤或发布凭据，
执行锁定基线构建、普通 npm install、功能断言和交接反例；Linux CI 的平台模拟不能替代真机验证。
原生容器流水线只排除此纯 JS port，由上述独立工作流负责检查；其他 port 仍走原流程。
真机 Node 使用 24.13.0；Electron-OH 使用 37.2.0 / 内置 Node 22.17.0；两者均 arm64。
十项功能检查包含一项明确模拟读异常和一项明确模拟平台别名，其余文件操作调用实际库实现。
Node 的 syscall fallback 是运行环境兼容层，不是库补丁；来源、哈希及源码见 demos/node/。
本次范围为功能回归与冷启动持久化，不宣称覆盖所有 Windows、并发或上游完整测试。

基线 MIT LICENSE.txt / NOTICE.txt 全部原样保留。
Demo 参考指定本地 vscode-deviceid 的 harmony-demo/harmony-demo-electron，采用 better-sqlite3
试点已经验证的同类 HNP 和 Electron-OH 37.2.0 工程骨架；引擎/SDK 授权由各自发行物保留。
