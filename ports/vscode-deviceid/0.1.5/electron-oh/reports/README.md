# 双宿主验证（2026-10-24）

候选：`@ohos-ports-electron/vscode-deviceid@0.1.5-electron-oh.0`。
候选 tgz SHA256：`e9d3f33adabdf70d325d020c8ac8ccabc431200eaad387d0e97e9fec92eb6d4c`。
所有报告都来自本次新构建 HAP 和新运行进程，不使用原本地 demo 的旧通过记录。

| 宿主 | 运行时 | 两次冷启动 PID | 结果 |
| --- | --- | --- | --- |
| 独立 Node | 24.13.0 / arm64 / openharmony | 43342、43856 | 两次各 10/10，0 失败，ID 持久化不变 |
| Electron-OH | 37.2.0 / 内置 Node 22.17.0 / arm64 / openharmony | 46003、46500 | 两次各 10/10，0 失败，ID 持久化不变 |

两套 HAP 均执行代码签名并 verify-app 成功，sha256 分别为：

- Node：`8d58eb3bc8fda84ee049c718bd0c451a121a0c7c4c406c6ebe53d39ebe0c0168`。
- Electron：`33805f7d2ef134e88ad90dded3d784e10d643078b316377fbd464b62459946e2`。

每个报告目录包括 run1/run2 实际 hilog 和断言、verification.json、公开构建身份、
普通 npm install 输出、依赖锁、构建日志和验签日志。未提交单独 profile、私钥或 HAP。
签名 HAP 和准确 tgz 位于本地仓库 `.local/`，可按构建/验证说明重建。

实际验证依赖：fs-extra 11.4.1、uuid 14.0.3、graceful-fs 4.2.11、jsonfile 6.2.1、universalify 2.0.1。
依赖声明仍沿用基线范围，实际解析及 integrity 见 dependency-lock.json。
Node 使用已锁定的 syscall fallback 环境，详见 ../demos/README.md。

`package-comparison.json` 记录基线 16 个原文件中 13 个逐字节保留，
只改变元数据和两个平台判断 JS；新增接入说明、条件安装脚本和适配身份文件，共 19 个文件。
`local-vs-online.json` 记录本地 dist/lib 与线上 dist 的逐文件对比；
设备 ID 核心 JS 和全部类型声明相同，两个平台判断文件不同。

宿主契约测试还覆盖普通安装、十项功能、基线拒绝 ohos 的对照、交接件增删改拒绝和默认禁发。
其中平台检查明确模拟 process.platform，异常恢复用例明确模拟失败的读操作；
这些局部模拟不能替代其余真实文件操作，也不表示在所有模拟平台真机执行过。
本次仅验证上述运行组合的功能和持久化，不声明 Windows 或完整上游压力测试已通过。

精简模板按哈希导入后已重新构建 Electron HAP 并重复两次冷启动验证；本目录保存最终结果。

## npm 发行核对

已发布 `@ohos-ports-electron/vscode-deviceid@0.1.5-electron-oh.0`，安装命令：

```sh
npm install @ohos-ports-electron/vscode-deviceid@electron-oh
```

registry 重新下载的 tgz 与双宿主验证使用的冻结候选 SHA256 完全一致。
使用全新缓存普通安装（不忽略 install 脚本），再次逐文件校验 19 个包文件并通过十项宿主功能检查。
该补充检查运行于 macOS；鸿蒙双宿主证据仍是上面记录的同一字节产物。
原 @ohos-ports 的 latest 仍为 0.1.5-beta.0，未修改原组织包或 tag。
详情见 publication.json 和 registry/；没有因发布重新构建或更改候选。
