'use strict';
// address 2.0.3 共享断言（宿主契约子集）——普通安装 + 加载 + 代表性功能回归。
// 选择 mock/纯逻辑用例（打桩 os.networkInterfaces / child.exec / fsPromises.readFile，fixtures 内联），
// 在任何宿主（Linux/Windows CI）确定性通过；设备专属用例（真机 lo/默认接口/promises 真查/tsc）由
// release-evidence.json 的真机矩阵承载（26/26 x2 x4 角色）。
// 契约：module.exports = { '<caseId>': ({check}) => void }；caseId 对应 02-baseline.json 的 name。
const os = require('node:os');
const child = require('node:child_process');
const fsPromises = require('node:fs/promises');
const address = require('@ohos-ports-electron/address');

const DARWIN_TXT = [
  'en1: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500',
  '    ether 78:ca:39:b0:e6:7d ',
  '    inet6 fe80::7aca:39ff:feb0:e67d%en1 prefixlen 64 scopeid 0x5 ',
  '    inet 192.168.2.104 netmask 0xffffff00 broadcast 192.168.2.255',
].join('\n');
const LINUX_TXT = [
  'eth0      Link encap:Ethernet  HWaddr 00:16:3E:00:0A:29  ',
  '          inet addr:10.125.5.202  Bcast:10.125.15.255  Mask:255.255.240.0',
  '          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1',
].join('\n');
const WIN32_INTERFACES = {
  '无线网络连接': [
    { address: 'fe80::f96c:4017:300f:e9ea', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: 'e8:2a:ea:8b:c2:20', scopeid: 14, internal: false },
    { address: '10.15.230.231', netmask: '255.255.254.0', family: 'IPv4', mac: 'e8:2a:ea:8b:c2:20', internal: false },
  ],
  'Loopback Pseudo-Interface 1': [
    { address: '::1', netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', family: 'IPv6', mac: '00:00:00:00:00:00', scopeid: 0, internal: true },
    { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true },
  ],
};
const DNS_LINUX_TXT = 'search tbsite.net\noptions attempts:1 timeout:2\nnameserver 10.125.250.210\nnameserver 172.24.102.254\n';

function withStub(obj, key, value, fn) {
  const orig = obj[key];
  obj[key] = value;
  try { return fn(); } finally { obj[key] = orig; }
}
function execData(content) {
  return (cmd, opts, cb) => { if (typeof opts === 'function') cb = opts; cb(null, content); };
}
function readFileData(content) {
  return async () => content;
}
function readFileError(message) {
  return async () => { throw new Error(message || 'mock fs error'); };
}
function call(fn, ...args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => { if (!settled) { settled = true; reject(new Error('回调超时（5s）')); } }, 5000);
    fn(...args, (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve({ err, value });
    });
  });
}
function assertOk(check, r, label) {
  check(0, !r.err, r.err ? String(r.err) : 'no-error', label + '：不抛错/不挂起');
}
const MAC_FMT = /^(?:[a-z0-9]{2}\:){5}[a-z0-9]{2}$/i;

const suite = {};

suite['test/address.test.ts regex check should MAC_IP_RE pass'] = async function ({ check }) {
  check(0, address.MAC_IP_RE.test('  inet 10.7.84.211 netmask 0xfffffc00 broadcast 10.7.87.255'), true, 'MAC_IP_RE 匹配 osx 行');
  check(1, address.MAC_IP_RE.test('          inet addr:10.125.5.202  Bcast:10.125.15.255  Mask:255.255.240.0'), true, 'MAC_IP_RE 匹配 linux 行');
};
suite['test/address.test.ts regex check should MAC_RE pass'] = async function ({ check }) {
  check(0, address.MAC_RE.test('    ether c4:2c:03:32:d5:3d '), true, 'MAC_RE 匹配 osx ether 行');
  check(1, address.MAC_RE.test('eth0      Link encap:Ethernet  HWaddr 00:16:3E:00:0A:29  '), true, 'MAC_RE 匹配 linux HWaddr 行');
};
suite['test/address.test.ts address() should return first ethernet addresses from osx'] = async function ({ check }) {
  await withStub(os, 'networkInterfaces', () => ({ en1: [{ address: '192.168.2.104', family: 'IPv4' }] }),
    async () => await withStub(child, 'exec', execData(DARWIN_TXT), async () => {
      const r = await call(address.address, 'en');
      assertOk(check, r, 'address(en) osx mock');
      check(1, r.value && r.value.ip === '192.168.2.104', String(r.value && r.value.ip), 'ip=192.168.2.104');
      check(2, r.value && r.value.mac === '78:ca:39:b0:e6:7d', String(r.value && r.value.mac), 'mac=78:ca:39:b0:e6:7d（darwin exec 兜底解析）');
    }));
};
suite['test/address.test.ts address() should return first ethernet addresses from linux'] = async function ({ check }) {
  await withStub(os, 'networkInterfaces', () => ({ eth: [{ address: '10.125.5.202', family: 'IPv4' }] }),
    async () => await withStub(child, 'exec', execData(LINUX_TXT), async () => {
      const r = await call(address.address, 'eth');
      assertOk(check, r, 'address(eth) linux mock');
      check(1, r.value && r.value.ip === '10.125.5.202', String(r.value && r.value.ip), 'ip=10.125.5.202');
      check(2, r.value && r.value.mac === '00:16:3E:00:0A:29', String(r.value && r.value.mac), 'mac=00:16:3E:00:0A:29（linux exec 兜底解析）');
    }));
};
suite['test/address.test.ts address.mac() should return mock mac address'] = async function ({ check }) {
  await withStub(os, 'platform', () => 'linux',
    () => withStub(os, 'networkInterfaces', () => ({
      en1: [{ address: '10.125.5.202', family: 'IPv4' }],
      eth1: [{ address: '10.125.5.202', family: 'IPv4' }],
    }),
      () => withStub(child, 'exec', execData(LINUX_TXT), async () => {
        const r = await call(address.mac, 'eth');
        assertOk(check, r, 'mac(eth) mock');
        check(1, !!r.value && MAC_FMT.test(r.value), String(r.value), 'mac 非空且符合 MAC 格式（linux exec 兜底）');
      })));
};
suite['test/address.test.ts address.mac() should return null when ip not exists'] = async function ({ check }) {
  await withStub(os, 'networkInterfaces', () => ({}), async () => {
    const r = await call(address.mac);
    assertOk(check, r, 'mac() 无接口');
    check(1, !r.value, String(r.value), 'mac 为空');
  });
};
suite['test/address.test.ts address.mac() should return mac mock win32'] = async function ({ check }) {
  await withStub(os, 'platform', () => 'win32',
    () => withStub(os, 'networkInterfaces', () => WIN32_INTERFACES, async () => {
      const r = await call(address.mac);
      assertOk(check, r, 'mac() win32 mock');
      check(1, r.value === 'e8:2a:ea:8b:c2:20', String(r.value), 'mac=e8:2a:ea:8b:c2:20（win32 主路径）');
    }));
};
suite['test/address.test.ts address.ip() should return the first not 127.0.0.1 interface'] = async function ({ check }) {
  await withStub(os, 'networkInterfaces', () => ({
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    bond0: [{ address: '10.206.52.79', family: 'IPv4', internal: false }],
  }), () => {
    const v = address.ip();
    check(0, v === '10.206.52.79', String(v), 'ip() 跳过回环取 10.206.52.79');
  });
};
suite['test/address.test.ts address.ip() should return scopeid = 0 address'] = async function ({ check }) {
  await withStub(os, 'networkInterfaces', () => ({
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    utun0: [
      { address: 'fe80::696:ad3d:eeec:1722', family: 'IPv6', internal: false, scopeid: 20 },
      { address: 'fe80::696:ad3d:eeee:ffff:1:1000:3380:b81a:2dd4:373e:1234', family: 'IPv6', internal: false, scopeid: 0 },
    ],
    utun1: [{ address: '10.206.52.79', family: 'IPv4', internal: false }],
  }), () => {
    check(0, address.ip('utun') === '10.206.52.79', String(address.ip('utun')), 'ip(utun)=10.206.52.79');
    check(1, address.ipv6('utun') === 'fe80::696:ad3d:eeee:ffff:1:1000:3380:b81a:2dd4:373e:1234', String(address.ipv6('utun')), 'ipv6(utun) 优先 scopeid=0 地址');
  });
};
suite['test/address.test.ts address.dns() should return dns servers from linux'] = async function ({ check }) {
  await withStub(fsPromises, 'readFile', readFileData(DNS_LINUX_TXT), async () => {
    const r = await call(address.dns);
    assertOk(check, r, 'dns() linux mock');
    check(1, Array.isArray(r.value) && r.value.length > 0, JSON.stringify(r.value), '服务器列表非空数组');
  });
};
suite['test/address.test.ts address.dns() should return err when fs error'] = async function ({ check }) {
  await withStub(fsPromises, 'readFile', readFileError('mock fs read error'), async () => {
    const r = await call(address.dns);
    check(0, !!r.err, r.err ? String(r.err) : 'no-error', 'dns() 文件读取错误时回调收到错误');
    check(1, !r.value, JSON.stringify(r.value), '服务器列表为空');
  });
};
suite['f03-01-get-interface-address'] = async function ({ check }) {
  await withStub(os, 'networkInterfaces', () => ({
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true, netmask: '255.0.0.0', mac: '00:00:00:00:00:00', cidr: '127.0.0.1/8' }],
    eth0: [{ address: '10.0.0.5', family: 'IPv4', internal: false, netmask: '255.255.255.0', mac: '00:16:3e:00:0a:29', cidr: '10.0.0.5/24' }],
  }), () => {
    const item = address.getInterfaceAddress('IPv4', 'lo');
    check(0, !!item, JSON.stringify(item), 'getInterfaceAddress("IPv4","lo") 返回接口对象');
    check(1, !!item && item.address === '127.0.0.1', String(item && item.address), 'address=127.0.0.1');
    check(2, !!item && item.family === 'IPv4', String(item && item.family), 'family=IPv4');
  });
};

module.exports = suite;
