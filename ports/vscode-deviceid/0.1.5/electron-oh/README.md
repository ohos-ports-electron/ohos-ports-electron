# vscode-deviceid：最小 Electron-OH 配方

发布目标仅为 `@ohos-ports-electron/vscode-deviceid`。当前版本 `0.1.5-electron-oh.1` 已发布，首次合入只重建、验证并幂等跳过上传，不覆盖 npm 历史版本。

本库在鸿蒙走纯 JS，不需要 NDK、Electron headers、libshim.a 或原生二进制签名。Windows 构建入口保留，未新增 Windows 真机验证。

| 文件 | 作用 |
| --- | --- |
| `../patchs/0001-*` | 在已有 openharmony 支持上增加 ohos；两种平台值都保留 |
| `../patchs/0002-*` | 设置独立 scope、修订版本、仓库、Windows 专用安装入口 |
| `../patchs/0003-*` | 原生动态 import uuid，兼容 Electron-OH 34 内置 Node 20 |
| `inputs.lock.json` | 原始 npm 包、补丁的版本与 SHA256/SHA512 输入锁 |
| `install.cjs`、`PACKAGE_README.md` | 随 npm 包分发的安装脚本和接入说明 |
| `tools/workflow.py` | 获取固定基线、应用补丁、比较原文件、只打包一次并冻结交接清单 |
| `tools/release.py` | 重验配方和产物、匹配设备验证证据、检查版本占用、发布同一 tgz |
| `tests/host-contract.py`、`tools/suite.cjs` | 普通安装、真实存储操作、两次进程启动和发布拒绝场景；平台别名明确为模拟 |
| `tests/dependencies.lock.json` | 固定功能回归所用传递依赖和完整性值，使用 npm ci |
| `release-evidence.json` | 四个运行时的精简真实验证报告，绑定当前 tgz；完整报告在单库仓库 |

构建及只读发行检查（不会上传）：

```sh
bash ports/vscode-deviceid/0.1.5/build.sh --output /tmp/deviceid-bundle
python3 ports/vscode-deviceid/0.1.5/electron-oh/tests/host-contract.py --bundle /tmp/deviceid-bundle
python3 ports/vscode-deviceid/0.1.5/electron-oh/tools/release.py --bundle /tmp/deviceid-bundle
```

使用 Python >=3.9、patch、Node 24.13.0、npm 11.21.0。可传 `--baseline /path/baseline.tgz`，仍校验哈希。输出目录必须不存在。
构建输出包含准确基线、候选 tgz、输入配方、比较报告与 bundle.json；发布作业下载并校验该产物，不重新 npm pack。
原 16 文件仅更改 package.json 和 3 个 JS 文件，其余 12 个字节不变；新增 3 个分发文件。原入口、类型、依赖声明、许可证均保留。

当前包 SHA256：`977edf078e3c3b30d07406577292ec480a26cb9828abfe53296d63636c224ab0`。
设备回归覆盖独立 Node 24.13.0、Electron-OH 34.5.4、37.2.0，以及官方 40.0.0 归档（引擎自报 40.1.0），各两次冷启动、10/10。
34 引擎自报 `0.0.0-no-git-tag-found`，由锁定引擎哈希辨认。40.0.1 未验证。Linux CI 不替代这些真机证据。
完整 demo、签名/冷启动日志和历史失败记录放在 [GitCode 单库分支](https://gitcode.com/OhosPortingSource/vscode-deviceid/tree/feat/vscode-deviceid-0.1.5-electron-oh)，不加入本聚合仓库。

基线 `@ohos-ports/vscode-deviceid@0.1.5-beta.0` 是输入来源，相关 URL、包名、完整性值必须保留；它不是本仓库的发布目标。
后续版本递增为 `.2`、`.3`，同步修改分发补丁、补丁哈希、输入锁、测试依赖锁及新候选的真机证据后提交 PR。仅改版本号不能复用旧候选哈希。
自动发布配置和首次启用步骤见 [发布说明](../../../../docs/RELEASING.md)。
