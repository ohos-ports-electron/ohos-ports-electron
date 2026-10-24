# ohos-ports-electron

以 ports 配方维护鸿蒙 Electron 三方库适配，发布到 **`@ohos-ports-electron`**。
聚合仓库只保存补丁、构建/发布入口、输入锁、精简回归与接入说明；完整库源码、demo 和完整验证报告保存在对应单库仓库。

## 已发布且接入本次 CI 的包

<!-- PORTS_TABLE_START -->
| 包名 | 版本 | 安装 |
|------|------|------|
| @ohos-ports-electron/vscode-deviceid | 0.1.5-electron-oh.1 | `npm i @ohos-ports-electron/vscode-deviceid` |
<!-- PORTS_TABLE_END -->

包列表查询页：[ohos-ports-electron](https://ohos-ports-electron.github.io/ohos-ports-electron/)。网站只查询 npm 公开信息，不执行 npm 发布。

## 贡献方式

```text
ports/<library>/<upstream-version>/
  patchs/                     基于准确输入版本的补丁
  build.sh                    锁定下载、应用补丁、构建并冻结 tgz
  publish.sh                  默认禁发；main CI 显式开启
  electron-oh/
    inputs.lock.json           输入来源、版本及完整性
    install.cjs               包内安装入口（按库需要）
    PACKAGE_README.md         包内使用说明
    README.md                 配方操作说明
    tools/                    构建、发行与验证工具
    tests/                    精简验证、测试依赖锁
    release-evidence.json     与候选 tgz 绑定的设备验证摘要
```

参见 [vscode-deviceid 配方](ports/vscode-deviceid/0.1.5/electron-oh/README.md) 和 [两阶段自动发行说明](docs/RELEASING.md)。

PR 运行构建与兼容检查；合入 main 后，发布 job 下载同一产物，经 npm Trusted Publishing 直接更新 latest。其他分支、Fork、手动运行均不能上传。
当前 `.1` 已发布，首次合入只会验证并幂等跳过；新修订必须更新版本和对应真机验证证据。

本 Fork 继承的其他 ports 暂时只构建，不自动发布。这些上游补丁中保留原包身份，不能仅替换 scope 就声称完成 Electron 验证。新发行流程和本次 vscode-deviceid 所有发布目标均使用 @ohos-ports-electron；输入锁中 @ohos-ports 是真实基线来源，保持原样。

## 来源和许可证

项目基于 [ohos-ports/ohos-ports](https://github.com/ohos-ports/ohos-ports) 的 ports 模式与 [DockerHarmony](https://github.com/hqzing/dockerharmony) 构建环境。
保留原作者和许可证；不提交密钥、签名 profile、完整运行时、设备数据或缓存。
页面部署见 [PLATFORM.md](docs/PLATFORM.md)。
