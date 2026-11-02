'use strict';
// windows-foreground-love 0.6.1 共享断言（与第一阶段设备套件同真源：上游 source/test/test.js 非 win32 分支）。
// 宿主契约断言（CI）：Linux/macOS 同为非 win32，JS 平台守卫恒 false——与鸿蒙设备行为同契约。
// 不含 addon 装载探针（设备专属：foreground_love.node 为宿主运行时供给，仅在设备 demo 装配）。
// 契约：module.exports = { '<caseId>': ({check}) => void }；caseId 对应 02-baseline.json 的 name。
const lib = require('@ohos-ports-electron/windows-foreground-love');
const api = lib.allowSetForegroundWindow;

const suite = {};

suite['Calling allowSetForegroundWindow with one argument...'] = async function (env) {
  const { check } = env;
  let cp = 0;
  check(cp++, typeof api === 'function', typeof api, 'function');
  let result, threw = false;
  try { result = api(process.pid); } catch (e) { threw = true; check(cp++, false, 'throw: ' + (e && e.message), '有参调用恒 false（不抛异常）'); }
  if (threw) return;
  check(cp++, result === false, String(result), '有参调用恒 false（上游非 win32 契约）');
  check(cp++, typeof result === 'boolean', typeof result, '返回类型 boolean');
};

suite['Calling allowSetForegroundWindow without arguments...'] = async function (env) {
  const { check } = env;
  let cp = 0;
  check(cp++, typeof api === 'function', typeof api, 'function');
  let result, threw = false;
  try { result = api(); } catch (e) { threw = true; check(cp++, false, 'throw: ' + (e && e.message), '无参调用恒 false（不抛异常）'); }
  if (threw) return;
  check(cp++, result === false, String(result), '无参调用恒 false（上游非 win32 契约）');
  check(cp++, typeof result === 'boolean', typeof result, '返回类型 boolean');
};

module.exports = suite;
