# @ohos-ports-electron/better-sqlite3

本目录保留 `.0` 已发布包使用的独立 scope 发行配置和直接发布入口。后续发行推荐使用
[组织构建与发行指南](../../ports/better-sqlite3/13.0.3/electron-oh/ORGANIZATION.md)中的两阶段暂存审核流程。
原 @ohos-ports 包、latest 及 GitHub PR #29 默认 scope 不变。
新包保留原 Node 文件，加入 Electron-OH ELF、manifest、完整 notices 和接入说明。
运行时通过 nativeBinding 显式选择 Electron 专用 ELF；原 Node 默认加载路径不变。

## 构建

使用 ../../ports/better-sqlite3/13.0.3/electron-oh/build-electron-oh.sh；
该组织仓库入口默认输出 @ohos-ports-electron/better-sqlite3。
基线始终是 @ohos-ports/better-sqlite3@13.0.3；底层通用 Python 工具保留原 scope 默认值，直接调用时应明确传入 --package-name。
正式模式为 --for-hap-distribution；CI 的 --allow-unsigned 只生成本地测试包。
授权及签名策略的依据见 RELEASE_AUTHORIZATION.md，发布检查不会用改包名绕过这些条件。

## 验证和发布

verify-package.py、test-package-contract.py、check-release.py 均应传
--package-name @ohos-ports-electron/better-sqlite3。
最终 tgz 运行独立 Node 10 项及 Electron HAP 18 项回归，校验实际加载的包名、版本和 ELF 哈希。
报告绑定最终 tgz 和已验签 HAP，不能把旧 scope 的报告改名冒充新包验证。

npm publish 使用 --ignore-scripts --access public --tag electron-oh
以及 --registry=https://registry.npmjs.org；仅发布同一个已验证的 tgz。
output/ 是本机发行物和日志，未提交 Git，不包含任何 token、私钥或 profile。

最终证据及实际发布结果见 ../../ports/better-sqlite3/13.0.3/electron-oh/reports/13.0.3-electron-oh.0/，npm 安装命令：

```sh
npm install --save-exact @ohos-ports-electron/better-sqlite3@13.0.3-electron-oh.0
```
