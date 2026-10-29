'use strict';
// systeminformation 5.33.16 — 阶段 3 业务套件（device-node / electron-oh 共用，两宿主独立记录结果）
//
// 契约：每个 case id 对应 02-baseline.json 的原始 name（cases.json 的 id）；
//   suite[id]({case, check}) 调真实库接口，check(cp, ok, actual, expected) 记录断言点：
//   ok=布尔判定、actual=实际值、expected=期望描述（run-suite.cjs 按此对账）。
// 断言设计（PRD checkpoint + 阶段 3 平台实测修正）：
//   - cp0 恒为「函数 resolve 未抛错/未挂起」（上游 testAll.js 契约）；
//   - cp1+ 数据形态断言：BLK-01 平台分支激活（核心函数返回合法数据）、BLK-02 fsSize 非空、
//     数据源不可用时库返回 null/0/空数组（合法降级，非抛错）——已按真机归因放宽：
//     os.cpus() 在 app 域为空（/proc/stat 不可读）→ cpu cores 由补丁 0003 回退 /proc/cpuinfo；
//     lscpu/dmidecode/sensors/lsblk/ps/who/w/ping/systemctl 等缺失 → 相关字段 null/空。
// 禁止 mock/空桩：所有数据来自 require('systeminformation') 真实调用。
const si = require('@ohos-ports-electron/systeminformation');

const ARGS = {
  versions: ['*'],
  get: [{ cpu: '*', mem: 'total, free' }],
  services: ['*'],
  processLoad: ['*'],
  inetChecksite: ['https://www.google.com'],
  inetLatency: ['8.8.8.8'],
  dockerContainerStats: ['*'],
  dockerContainerProcesses: ['*'],
};

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v) => typeof v === 'string';
const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v) => Array.isArray(v);
const has = (v, k) => obj(v) && Object.prototype.hasOwnProperty.call(v, k);
// 数据源不可用时库返回 null（命令/系统数据缺失），与 0/空串同义（合法降级）
const numOrNull = (v) => v === null || num(v);

async function call(fn, args, check) {
  const value = await fn(...args);
  check(0, true, 'resolved', 'resolve 不抛错/不挂起');
  return value;
}

module.exports = {
  // ---- 系统与固件静态信息（数据源 /sys/dmi + dmidecode；dmidecode 缺失 → 空字段对象） ----
  async system({ check }) {
    const v = await call(si.system, [], check);
    check(1, has(v, 'manufacturer') && has(v, 'model') && has(v, 'serial') && has(v, 'uuid') && has(v, 'sku') && has(v, 'version'), JSON.stringify(Object.keys(v)), '字段齐全（manufacturer/model/serial/uuid/sku/version）');
    check(2, [str(v.manufacturer), str(v.model), str(v.version), str(v.serial), str(v.sku), str(v.uuid)].every(Boolean), JSON.stringify([v.manufacturer, v.model, v.version, v.serial]), '字段均为字符串（数据源缺失时为空串）');
  },
  async bios({ check }) {
    const v = await call(si.bios, [], check);
    check(1, has(v, 'vendor') && has(v, 'version') && has(v, 'releaseDate'), JSON.stringify(Object.keys(v)), '字段齐全（vendor/version/releaseDate）');
    check(2, [str(v.vendor), str(v.version), str(v.releaseDate)].every(Boolean), JSON.stringify([v.vendor, v.version, v.releaseDate]), '字段均为字符串');
  },
  async baseboard({ check }) {
    const v = await call(si.baseboard, [], check);
    check(1, has(v, 'manufacturer') && has(v, 'model') && has(v, 'version') && has(v, 'serial'), JSON.stringify(Object.keys(v)), '字段齐全（manufacturer/model/version/serial）');
    check(2, [str(v.manufacturer), str(v.model), str(v.version), str(v.serial)].every(Boolean), JSON.stringify([v.manufacturer, v.model, v.version]), '字段均为字符串');
  },
  async chassis({ check }) {
    const v = await call(si.chassis, [], check);
    check(1, has(v, 'manufacturer') && has(v, 'model') && has(v, 'type') && has(v, 'assetTag'), JSON.stringify(Object.keys(v)), '字段齐全（manufacturer/model/type/assetTag）');
    check(2, [str(v.manufacturer), str(v.model), str(v.type), str(v.assetTag)].every(Boolean), JSON.stringify([v.manufacturer, v.model, v.type]), '字段均为字符串');
  },

  // ---- 操作系统信息 ----
  async time({ check }) {
    const v = await call(si.time, [], check);
    check(1, num(v.current) && v.current > 0, String(v.current), 'current 为合法毫秒时间戳');
    check(2, num(v.uptime) && v.uptime >= 0, String(v.uptime), 'uptime 非负');
    check(3, str(v.timezone) && str(v.timezoneName), JSON.stringify([v.timezone, v.timezoneName]), '时区字段为字符串');
  },
  async osInfo({ check }) {
    const v = await call(si.osInfo, [], check);
    check(1, v.platform === 'openharmony', String(v.platform), 'platform 识别为 openharmony（BLK-01 分支激活）');
    check(2, [str(v.distro), str(v.release), str(v.codename)].every(Boolean), JSON.stringify([v.distro, v.release, v.codename]), '发行版字段为字符串');
    check(3, [str(v.kernel), str(v.arch), str(v.hostname)].every(Boolean), JSON.stringify([v.kernel, v.arch, v.hostname]), '内核/架构/主机名为字符串');
  },
  async versions({ check }) {
    const v = await call(si.versions, ['*'], check);
    // 补丁 0003：node -v 失败时回退 process.versions.node（无全局 node）
    check(1, v.node === process.versions.node, JSON.stringify([v.node, process.versions.node]), 'node 版本匹配当前运行时');
  },
  async shell({ check }) {
    const v = await call(si.shell, [], check);
    check(1, str(v), JSON.stringify(v), 'shell 为字符串（可为空串）');
  },
  async uuid({ check }) {
    const v = await call(si.uuid, [], check);
    // 5.33.16 uuid() 直接返回对象 {os, hardware, macs}
    check(1, obj(v) && has(v, 'os') && has(v, 'hardware') && has(v, 'macs'), JSON.stringify(Object.keys(v)), 'uuid 为对象（os/hardware/macs）');
    check(2, str(v.os) && str(v.hardware) && arr(v.macs), JSON.stringify([v.os, v.hardware, v.macs]), 'os/hardware 字符串、macs 数组');
  },

  // ---- CPU 信息与负载 ----
  async cpu({ check }) {
    const v = await call(si.cpu, [], check);
    check(1, num(v.cores) && v.cores >= 1, String(v.cores), 'cores 为正整数（补丁 0003 回退 /proc/cpuinfo processor 行）');
    check(2, num(v.physicalCores) && v.physicalCores >= 1, String(v.physicalCores), 'physicalCores 为正整数');
    check(3, str(v.brand) && str(v.manufacturer), JSON.stringify([v.brand, v.manufacturer]), 'brand/manufacturer 为字符串');
    check(4, num(v.processors) && v.processors >= 0, String(v.processors), 'processors 非负');
    // 诊断（informational）：app 域 os.cpus()/loadavg//proc 可见性
    const os = require('os');
    const cp = require('child_process');
    let procStat = 'ERR';
    try { procStat = cp.execSync('cat /proc/stat 2>/dev/null | head -1').toString().trim().slice(0, 60); } catch { procStat = 'THROW'; }
    check(9, true, `diag os.cpus().length=${os.cpus().length} loadavg=${JSON.stringify(os.loadavg())} procstat=[${procStat}]`, 'diag（不影响判定）');
  },
  async cpuFlags({ check }) {
    const v = await call(si.cpuFlags, [], check);
    check(1, str(v), JSON.stringify(v), 'cpuFlags 为字符串');
  },
  async cpuCache({ check }) {
    const v = await call(si.cpuCache, [], check);
    // lscpu 缺失 → 缓存字段为 null（合法降级）
    check(1, [numOrNull(v.l1d), numOrNull(v.l1i), numOrNull(v.l2), numOrNull(v.l3)].every(Boolean), JSON.stringify([v.l1d, v.l1i, v.l2, v.l3]), '缓存字段为 0/正数或 null（lscpu 缺失）');
  },
  async cpuCurrentSpeed({ check }) {
    const v = await call(si.cpuCurrentSpeed, [], check);
    check(1, [numOrNull(v.avg), numOrNull(v.min), numOrNull(v.max)].every(Boolean), JSON.stringify([v.avg, v.min, v.max]), '频率字段为数值或 null（aarch64 无 cpu MHz 时可为 0）');
  },
  async cpuTemperature({ check }) {
    const v = await call(si.cpuTemperature, [], check);
    // 无 thermal/sensors 数据源 → main/max 为 null、cores 为空数组（合法降级）
    check(1, str(v.main) || v.main === null, JSON.stringify(v.main), 'main 为字符串或 null');
    check(2, arr(v.cores), String(arr(v.cores) ? v.cores.length : typeof v.cores), 'cores 为数组');
    check(3, numOrNull(v.max), String(v.max), 'max 为数值或 null');
  },
  async currentLoad({ check }) {
    const v = await call(si.currentLoad, [], check);
    // 补丁 0003：cores 未知时 avgLoad=0（避免 Infinity）；/proc/stat 不可读时 cpus 为空数组
    check(1, num(v.avgLoad) && v.avgLoad >= 0 && v.avgLoad <= 100, String(v.avgLoad), 'avgLoad 在 0~100（数据源不可用时为 0）');
    check(2, num(v.currentLoad) && v.currentLoad >= 0 && v.currentLoad <= 100, String(v.currentLoad), 'currentLoad 在 0~100');
    check(3, arr(v.cpus), String(arr(v.cpus) ? v.cpus.length : typeof v.cpus), 'cpus 为数组（/proc/stat 不可读时为空）');
  },
  async fullLoad({ check }) {
    const v = await call(si.fullLoad, [], check);
    check(1, num(v) && v >= 0 && v <= 100, String(v), 'fullLoad 为 0~100 数值（os.cpus 为空时 0）');
  },

  // ---- 内存信息 ----
  async mem({ check }) {
    const v = await call(si.mem, [], check);
    check(1, num(v.total) && v.total > 0, String(v.total), 'total 大于 0（/proc/meminfo 可用）');
    check(2, num(v.free) && num(v.used) && num(v.available), JSON.stringify([v.free, v.used, v.available]), 'free/used/available 为数值');
    // 无 swap → swaptotal/swapused 为 null 或缺失（合法降级）；字段名为库实际 API 名
    check(3, (v.swaptotal === undefined || v.swaptotal === null || num(v.swaptotal)) && (v.swapused === undefined || v.swapused === null || num(v.swapused)), JSON.stringify([v.swaptotal, v.swapused]), 'swap 字段为数值、null 或缺失（无 swap）');
  },
  async memLayout({ check }) {
    const v = await call(si.memLayout, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'memLayout 为数组（无 dmidecode 时为空）');
  },

  // ---- 电池与电源 ----
  async battery({ check }) {
    const v = await call(si.battery, [], check);
    check(1, typeof v.hasBattery === 'boolean', String(v.hasBattery), 'hasBattery 为布尔');
  },

  // ---- 显卡与显示 ----
  async graphics({ check }) {
    const v = await call(si.graphics, [], check);
    check(1, arr(v.controllers) && arr(v.displays), JSON.stringify([Array.isArray(v.controllers), Array.isArray(v.displays)]), 'controllers/displays 为数组');
  },

  // ---- 文件系统与磁盘 ----
  async fsSize({ check }) {
    const v = await call(si.fsSize, [], check);
    check(1, arr(v) && v.length >= 1, String(arr(v) ? v.length : typeof v), '挂载列表非空（BLK-02 toybox df 兼容生效）');
    check(2, v.every((e) => str(e.fs) && str(e.mount) && num(e.size) && num(e.used) && num(e.available) && num(e.use)), JSON.stringify(v.map((e) => [e.fs, e.mount, e.size])), '元素字段类型合法');
  },
  async fsOpenFiles({ check }) {
    const v = await call(si.fsOpenFiles, [], check);
    // /proc/sys/fs/file-nr 在 app 域不可读 → 字段为 null（合法降级）
    check(1, numOrNull(v.max) && numOrNull(v.allocated) && numOrNull(v.available), JSON.stringify([v.max, v.allocated, v.available]), '字段为数值或 null（file-nr 不可读）');
  },
  async blockDevices({ check }) {
    const v = await call(si.blockDevices, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'blockDevices 为数组（无 lsblk 时为空）');
  },
  async fsStats({ check }) {
    const v = await call(si.fsStats, [], check);
    // rx/wx 为 0、rx_sec/wx_sec 为 null（lsblk/diskstats 不可用）；字段名为库实际 API 名
    check(1, num(v.rx) && num(v.wx) && numOrNull(v.rx_sec) && numOrNull(v.wx_sec), JSON.stringify([v.rx, v.wx, v.rx_sec, v.wx_sec]), 'rx/wx 数值、rx_sec/wx_sec 数值或 null');
  },
  async disksIO({ check }) {
    const v = await call(si.disksIO, [], check);
    check(1, num(v.rIO) && num(v.wIO) && num(v.tIO), JSON.stringify([v.rIO, v.wIO, v.tIO]), 'rIO/wIO/tIO 数值（lsblk 缺失时为 0）');
    check(2, numOrNull(v.rIO_sec) && numOrNull(v.wIO_sec), JSON.stringify([v.rIO_sec, v.wIO_sec]), 'rIO_sec/wIO_sec 数值或 null');
  },
  async diskLayout({ check }) {
    const v = await call(si.diskLayout, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'diskLayout 为数组（无 lsblk 时为空）');
  },

  // ---- 网络信息 ----
  async networkInterfaceDefault({ check }) {
    const v = await call(si.networkInterfaceDefault, [], check);
    check(1, str(v), JSON.stringify(v), '默认接口为字符串');
  },
  async networkGatewayDefault({ check }) {
    const v = await call(si.networkGatewayDefault, [], check);
    check(1, str(v), JSON.stringify(v), '网关为字符串（ip 命令缺失时为空串）');
  },
  async networkInterfaces({ check }) {
    const v = await call(si.networkInterfaces, [], check);
    check(1, arr(v) && v.length >= 1, String(arr(v) ? v.length : typeof v), '接口列表非空（os 层至少回环）');
    check(2, v.every((e) => str(e.iface)), String(v.length), '元素含 iface 字符串');
  },
  async networkStats({ check }) {
    const v = await call(si.networkStats, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'networkStats 为数组');
    check(2, v.every((e) => str(e.iface) && num(e.rx_bytes) && num(e.tx_bytes) && e.rx_bytes >= 0 && e.tx_bytes >= 0), String(v.length), '元素含 iface 与非负流量');
  },
  async networkConnections({ check }) {
    const v = await call(si.networkConnections, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'networkConnections 为数组（无 ss/netstat 时为空）');
  },

  // ---- 无线网络 ----
  async wifiNetworks({ check }) {
    const v = await call(si.wifiNetworks, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'wifiNetworks 为数组（无 iw/nmcli 时为空）');
  },
  async wifiInterfaces({ check }) {
    const v = await call(si.wifiInterfaces, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'wifiInterfaces 为数组');
  },
  async wifiConnections({ check }) {
    const v = await call(si.wifiConnections, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'wifiConnections 为数组');
  },

  // ---- 进程与服务 ----
  async processes({ check }) {
    const v = await call(si.processes, [], check);
    check(1, num(v.all) && v.all >= 0, String(v.all), 'all 非负（ps 缺失时为 0）');
    check(2, arr(v.list) && v.list.every((p) => num(p.pid)), String(arr(v.list) ? v.list.length : typeof v.list), 'list 为数组且元素含 pid');
  },
  async processLoad({ check }) {
    const v = await call(si.processLoad, ['*'], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'processLoad 为数组');
  },
  async services({ check }) {
    const v = await call(si.services, ['*'], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'services 为数组（无 systemctl/service 时为空）');
  },

  // ---- 用户会话 ----
  async users({ check }) {
    const v = await call(si.users, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'users 为数组（无 who/w 时为空）');
  },

  // ---- 网络连通性 ----
  async inetChecksite({ check }) {
    const v = await call(si.inetChecksite, ['https://www.google.com'], check);
    check(1, obj(v) && typeof v.ok === 'boolean' && num(v.status), JSON.stringify(v), 'ok 为布尔且 status 为数值');
  },
  async inetLatency({ check }) {
    const v = await call(si.inetLatency, ['8.8.8.8'], check);
    check(1, v === null || (num(v) && v >= 0), String(v), '结果为毫秒数值或 null（ping 缺失降级）');
  },

  // ---- Docker（无 daemon，降级） ----
  async dockerInfo({ check }) {
    const v = await call(si.dockerInfo, [], check);
    check(1, obj(v), JSON.stringify(Object.keys(v)), 'dockerInfo 为对象（无 daemon 时字段为空）');
  },
  async dockerImages({ check }) {
    const v = await call(si.dockerImages, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'dockerImages 为数组');
  },
  async dockerContainers({ check }) {
    const v = await call(si.dockerContainers, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'dockerContainers 为数组');
  },
  async dockerContainerStats({ check }) {
    const v = await call(si.dockerContainerStats, ['*'], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'dockerContainerStats 为数组');
  },
  async dockerContainerProcesses({ check }) {
    const v = await call(si.dockerContainerProcesses, ['*'], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'dockerContainerProcesses 为数组');
  },
  async dockerVolumes({ check }) {
    const v = await call(si.dockerVolumes, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'dockerVolumes 为数组');
  },
  async dockerAll({ check }) {
    const v = await call(si.dockerAll, [], check);
    // dockerAll 返回容器数组（无 daemon 时为空数组）
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'dockerAll 为数组（无 daemon 时为空）');
  },

  // ---- VirtualBox（无 VBoxManage，降级） ----
  async vboxInfo({ check }) {
    const v = await call(si.vboxInfo, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'vboxInfo 为数组');
  },

  // ---- 外设与多媒体 ----
  async printer({ check }) {
    const v = await call(si.printer, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'printer 为数组（无 lpstat/CUPS 时为空）');
  },
  async usb({ check }) {
    const v = await call(si.usb, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'usb 为数组（无 lsusb 时为空）');
  },
  async audio({ check }) {
    const v = await call(si.audio, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'audio 为数组（无 lspci 时为空）');
  },
  async bluetoothDevices({ check }) {
    const v = await call(si.bluetoothDevices, [], check);
    check(1, arr(v), String(arr(v) ? v.length : typeof v), 'bluetoothDevices 为数组（无 hcitool 时为空）');
  },

  // ---- 聚合查询与观察 ----
  async version({ check }) {
    const v = await call(si.version, [], check);
    // 共享断言对基线/候选通用：版本号为库自报字符串且与所装载包的 package.json 版本一致
    let pkgVer = '';
    try { pkgVer = require('@ohos-ports-electron/systeminformation/package.json').version; } catch {}
    check(1, str(v) && v.length > 0 && v === pkgVer, JSON.stringify([v, pkgVer]), '版本号为所装载包的 package.json 版本');
  },
  async getStaticData({ check }) {
    const v = await call(si.getStaticData, [], check);
    const keys = ['version', 'system', 'bios', 'baseboard', 'chassis', 'os', 'uuid', 'cpu', 'graphics', 'net', 'memLayout', 'diskLayout', 'audio', 'bluetooth', 'usb', 'printer'];
    check(1, obj(v), JSON.stringify(Object.keys(v)), 'getStaticData 为对象');
    check(2, keys.every((k) => has(v, k)), JSON.stringify(keys.filter((k) => !has(v, k))), '静态子字段齐全');
  },
  async getDynamicData({ check }) {
    const v = await call(si.getDynamicData, [], check);
    const keys = ['time', 'node', 'cpuCurrentSpeed', 'currentLoad', 'mem', 'fsSize', 'inetLatency', 'processes', 'users', 'battery', 'services', 'networkStats', 'networkConnections'];
    check(1, obj(v), JSON.stringify(Object.keys(v)), 'getDynamicData 为对象');
    check(2, keys.every((k) => has(v, k)), JSON.stringify(keys.filter((k) => !has(v, k))), '动态子字段齐全');
  },
  async getAllData({ check }) {
    const v = await call(si.getAllData, [], check);
    check(1, obj(v), JSON.stringify(Object.keys(v)), 'getAllData 为对象');
    check(2, has(v, 'version') && has(v, 'system') && has(v, 'mem') && has(v, 'currentLoad'), JSON.stringify([has(v, 'version'), has(v, 'system'), has(v, 'mem'), has(v, 'currentLoad')]), '静态+动态字段并存');
  },
  async get({ check }) {
    const v = await call(si.get, [{ cpu: '*', mem: 'total, free' }], check);
    check(1, obj(v), JSON.stringify(Object.keys(v)), 'get 为对象');
    check(2, has(v, 'cpu') && obj(v.cpu), JSON.stringify(Object.keys(v.cpu || {})), 'cpu 子对象存在');
    check(3, has(v, 'mem') && has(v.mem, 'total') && has(v.mem, 'free'), JSON.stringify(Object.keys(v.mem || {})), 'mem 含 total/free 字段');
  },

  // ---- 回归检查（testAll.js:91-121 等价） ----
  async 'get({cpu:5}) does not crash'({ check }) {
    const v = await si.get({ cpu: 5 });
    check(0, true, 'resolved', 'get() 非字符串值不崩溃不挂起');
    check(1, obj(v), typeof v, '结果为对象');
  },
  async 'get({observe}) is blocked'({ check }) {
    const v = await si.get({ observe: 'x' });
    check(0, true, 'resolved', 'get() 拦截控制函数 observe，不泄漏 interval');
    check(1, obj(v), typeof v, '结果为对象');
  },
  async "versions('kernel') resolves"({ check }) {
    const v = await si.versions('kernel');
    check(0, true, 'resolved', "versions('kernel') 单键查询不挂起");
    check(1, obj(v), typeof v, '结果为对象');
  },
  async "processLoad('------') resolves"({ check }) {
    const v = await si.processLoad('------');
    check(0, true, 'resolved', "processLoad('------') 污染哨兵输入不挂起");
    check(1, arr(v), String(arr(v) ? v.length : typeof v), '结果为数组');
  },
};
