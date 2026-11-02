# address (ohos-ports port)

**Port**: `address@2.0.3`（MIT，fengmk2）——获取本机 IPv4/IPv6 地址、MAC 与 DNS 服务器的 Node.js 工具库（纯 TS/JS，仅用 Node 内置模块，零第三方运行时依赖）。

- 上游仓库：https://github.com/node-modules/address
- npm 基线：https://www.npmjs.com/package/address@2.0.3，锁定 tgz sha256 `1c900ff1…c319a`
- 发行身份：`@ohos-ports-electron/address@2.0.3-electron-oh.0`
  - repository: `git+https://github.com/ohos-ports-electron/ohos-ports-electron.git`（directory `ports/address/2.0.3`）
  - dist-tags: `latest`、`electron-oh`
  - 候选 tgz sha256 `7edf1283…ba03a`（tar `138c06c9…04f5`）
- 适配结论：**pure-runtime / no_adaptation**——纯 JS 库零功能补丁（`patchs/` 为空）；候选 = 基线 + 单条 `package.json` 元数据改写（name/version/repository/description/bugs）。

## 布局差异（关键）

npm 发布包 gitHead `75fbf027…` 与本地适配源码 commit `945c9b62…` 不同（发布后源码演进）：
npm dist 与本地 tshy 重建 dist 字节不同，但导出面/正则/解析逻辑逐项核对一致（宿主冒烟：linux exec 兜底
mac=`00:16:3E:00:0A:29`、win32 主路径 `e8:2a:ea:8b:c2:20`）。baseline 严格使用锁定 npm tgz 原始字节。

## 平台契约

设备 os.platform()='openharmony'（走库的 linux 分支语义）；活动接口 wlan0（非库默认约定 eth*/en*，
mac 默认接口三条用例以等价测试方法显式传活动接口名，断言契约不变）；`/sbin/ifconfig` exec 兜底为鸿蒙
app 域已知降级（B1：SELinux 仅放行私有 HNP 内 ELF，套件以 CI 语义 + mock exec 用例覆盖）。
`/etc/resolv.conf` app 域可读（promises.dns 真机实读返回 114.114.114.114/8.8.8.8）。

## 验证矩阵（真机 OpenHarmony-7.0.0.109, HAD-W32, aarch64, API 26）

| 角色 | 运行时 | 引擎自报 | 基线 | 候选 |
|---|---|---|---|---|
| node | device-node 24.13.0 | node 24.13.0 (napi 10) | passed 26/26 ×2 | passed 26/26 ×2 |
| electron-reference | Electron-OH 37.2.0 | electron 37.2.0 | passed 26/26 ×2 | passed 26/26 ×2 |
| electron34 | Electron-OH 34.8.6 | electron v34.8.6-release | passed 26/26 ×2 | passed 26/26 ×2 |
| electron40 | Electron-OH 40.0.1 | electron v40.0.1-release | passed 26/26 ×2 | passed 26/26 ×2 |

名册 26 条（上游 address.test.ts/promises.test.ts/ts.test.ts + 补写 getInterfaceAddress）逐条设备真跑。
候选首轮 25/26 根因（scoped 候选包 ts 类型用例 `@types` 路径错位）已修正后 26/26。

## 目录

- `electron-oh/inputs.lock.json` —— 锁定输入（npm tgz 哈希、运行时发行物哈希、候选身份与哈希）
- `electron-oh/tests/` —— 本库共享断言 `suite.cjs`（按 scoped 名接线）+ 锁定 `package.json`
- `electron-oh/tools/` —— 设备运行捕获脚本 + `build-candidate.mjs`（候选可重放生成）
- `electron-oh/release-evidence.json` —— 候选 + 发行判定证据
- `patchs/` —— 空（零功能补丁）

## 复现

见工程根 `demos/build-demo.ps1` 与 `demos/verify-device.ps1`；候选生成见 `electron-oh/tools/build-candidate.mjs --verify`。