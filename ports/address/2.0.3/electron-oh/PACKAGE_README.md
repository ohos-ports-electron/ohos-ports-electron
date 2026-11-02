# PACKAGE_README

`@ohos-ports-electron/address` 2.0.3-electron-oh.0 是鸿蒙 PC (OpenHarmony) 移植的
`address@2.0.3`：获取本机 IPv4/IPv6 地址、MAC 与 DNS 服务器的 Node.js 工具库。纯 TS/JS、仅用 Node 内置模块、零第三方运行时依赖、MIT。

与上游 **零功能差异**（零补丁）：API、导出面、类型声明与 Node 行为完全一致，仅 `package.json` 分发元数据改为本 scope
（name/version/repository/description/bugs）。

## 安装

```sh
npm install @ohos-ports-electron/address
```

纯 JS 库，无原生扩展、无 gypfile，普通安装即用（tshy 双格式 dist/esm + dist/commonjs 已随包分发）。

## 用法

```js
const address = require('@ohos-ports-electron/address');
const promises = require('@ohos-ports-electron/address/promises');

address.ip();                 // 本机 IPv4（跳过回环）
address.ipv6();               // 本机 IPv6（scopeid=0 优先）
address.mac((err, mac) => {}); // 本机 MAC
address.dns((err, servers) => {}); // 读 /etc/resolv.conf 的 nameserver 列表
address.address((err, addr) => {}); // 汇总 ip/ipv6/mac
await promises.address();     // Promise 形态
```

也支持 ESM：`import address from '@ohos-ports-electron/address'`。

## 鸿蒙 PC 平台提示

- 设备 `os.platform()` 上报 `openharmony`（走库的 linux 分支语义）；IPv4/IPv6/MAC 主路径与 DNS 读取在真机 26/26 验证通过。
- `mac()` 在接口无 MAC 时的兜底路径会 exec `/sbin/ifconfig`——鸿蒙 app 域 SELinux 仅放行私有 HNP 内 ELF，
  该兜底可能降级（回调错误/空）；主路径（`os.networkInterfaces()` 直取 MAC）不受影响。
- `dns()` 默认读 `/etc/resolv.conf`（app 域可读，真机返回真实 nameserver）；也可传自定义文件路径。
