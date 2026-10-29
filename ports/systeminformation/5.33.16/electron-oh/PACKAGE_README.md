# PACKAGE_README

`@ohos-ports-electron/systeminformation` 5.33.16-electron-oh.0 — 鸿蒙 PC (OpenHarmony) 移植的
systeminformation 5.33.16。纯 JS、CommonJS、零原生依赖，MIT。

与原库 `systeminformation` 的差异仅在平台识别与运行时兼容：

- 识别 `process.platform === 'openharmony'`（设备 Node / Electron-OH 34/37）
- 识别 `process.platform === 'ohos'`（Electron-OH 40）
- fsSize 兼容 toybox `df`（`df -kP` + `/proc/mounts` 类型映射）
- app 域运行时守卫：`os.cpus()` 为空时 currentLoad 除零守卫、核数回退、node 版本回退

API 面、类型定义、许可证与 Node 行为保持不变。

## 安装

```sh
npm install @ohos-ports-electron/systeminformation
```

## 用法

```js
const si = require('@ohos-ports-electron/systeminformation');
await si.cpu();
await si.mem();
```

## 平台支持

`os`: darwin, linux, win32, freebsd, openbsd, netbsd, sunos, android, openharmony, ohos

## 已知限制

- 依赖外部命令的数据源（lscpu/dmidecode/lsblk/lspci/ps/who/iw*/smartctl/ping/systemctl 等）
  在鸿蒙 PC 缺失或为 toybox 子集时，按库内 try/catch 安全降级为空数据（不抛错）。
- app 域部分 /proc 文件（/proc/stat、/proc/diskstats、/proc/sys/fs/file-nr）不可读时，
  相关字段合法降级为 null/0/空。
- Electron-OH 40.0.1 上命令子进程 exec 存在运行时挂起（本库无法绕开），该目标暂 blocked。
