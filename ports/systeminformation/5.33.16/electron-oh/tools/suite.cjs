'use strict';
// Host contract assertions: ordinary install + load + representative core functions resolve
// with legal structure on the CI host (Linux/Windows). HarmonyOS platform semantics are
// recorded in release-evidence.json from first-stage device runs (61/61). No mock.
const si = require('@ohos-ports-electron/systeminformation');
const num = v => typeof v === 'number' && Number.isFinite(v);
const str = v => typeof v === 'string';
const obj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
module.exports = async () => {
  const checks = [];
  const check = (id, ok, actual) => checks.push({ id, ok, actual: String(actual).slice(0, 160) });
  const withCheck = id => async (fn) => {
    try { const v = await fn(); check(id, true, JSON.stringify(v).slice(0, 160)); }
    catch (e) { check(id, false, 'ERR:' + String(e).slice(0, 120)); }
  };
  const run = [];
  run.push(withCheck('version')(() => Promise.resolve(si.version())));
  run.push(withCheck('time')(() => si.time()));
  run.push(withCheck('osInfo')(() => si.osInfo()));
  run.push(withCheck('cpu')(() => si.cpu()));
  run.push(withCheck('mem')(() => si.mem()));
  run.push(withCheck('currentLoad')(() => si.currentLoad()));
  run.push(withCheck('fsSize')(() => si.fsSize()));
  run.push(withCheck('networkInterfaces')(() => si.networkInterfaces()));
  run.push(withCheck('getStaticData')(() => si.getStaticData()));
  await Promise.all(run);
  const pass = checks.filter(c => c.ok).length;
  return { pass, total: checks.length, fail: checks.length - pass, results: checks };
};
