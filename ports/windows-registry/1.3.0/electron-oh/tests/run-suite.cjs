'use strict';
// 原 OHPTCASE 日志协议；测试未接线、缺检查点或抛错都不能成为 PASS。
//
// v2（fixed-harness，2026-11-09 gate 点名修复）：
//  - 逐用例看门狗（OHPT_CASE_TIMEOUT_MS，默认 60s）：用例 Promise 不落定（挂起）时中止并记 fail，
//    套件不再被单条挂死。
//  - uncaughtException / unhandledRejection 全局兜底：undici@8.12.2 在 socket connect 事件回调里
//    同步抛 WebAssemblyNotSupportedError，该逃逸错误不在任何逐条 try/catch 内（进程级），旧版不拦截
//    直接 child_exit=1 杀掉整个 node 进程（实证：run-2 在 options.signal 崩溃，20 条未出结果）。
//    兜底语义：把逃逸错误登记为当前用例的失败（fail，携带原始栈），其余用例照常继续；错误本身
//    仍是真实平台缺口（WASM 不可用）的证据，不吞、不改判。
const CASE_TIMEOUT_MS = Number(process.env.OHPT_CASE_TIMEOUT_MS || 60000);

async function runSuite(doc, suite, selected, emit = console.log) {
  const actualHost = process.versions.electron ? 'electron-oh' : 'device-node';
  if (doc.host_runtime && doc.host_runtime !== actualHost) throw Error('运行宿主不匹配');
  emit(`OHPTCASE runtime host=${actualHost}`);
  const rows = selected === 'all' ? doc.cases : doc.cases.filter(c => c.id === selected);
  if (!rows.length) throw Error('未知用例：' + selected);
  const results = [];
  const token = value => encodeURIComponent(String(value));

  // ── 崩溃兜底（见头注释）──
  let current = null; // { id, reject, timer }
  const settleUncaught = (label, err) => {
    const msg = label + ': ' + String(err && err.stack || err);
    const snapshot = token(msg).slice(0, 500);
    if (current) {
      const cur = current;
      current = null;
      clearTimeout(cur.timer);
      // 用例级拒绝：该用例记 fail（平台缺口证据），后续用例继续
      cur.reject(new Error(msg));
      emit(`HARNESS-CATCH ${label} id=${cur.id} ${snapshot}`);
    } else {
      emit(`HARNESS-CATCH ${label} no-active-case ${snapshot}`);
    }
  };
  const onUncaught = (err) => settleUncaught('uncaughtException', err);
  const onUnhandled = (reason) => settleUncaught('unhandledRejection', reason);
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUnhandled);
  try {
    for (const c of rows) {
      const checks = [];
      let result = 'blocked', detail = '测试尚未接线';
      if (typeof suite[c.id] === 'function') {
        try {
          await new Promise((resolve, reject) => {
            const cur = { id: c.id, reject, timer: null };
            cur.timer = setTimeout(() => {
              if (current === cur) current = null;
              reject(new Error(`case watchdog timeout after ${CASE_TIMEOUT_MS}ms`));
            }, CASE_TIMEOUT_MS);
            current = cur;
            Promise.resolve().then(() => suite[c.id]({ case: c, check(cp, ok, actual, expected) {
              if (!Number.isInteger(cp) || cp < 0 || checks.some(v=>v.cp===cp) || typeof ok !== 'boolean') throw Error('无效或重复检查点');
              checks.push({cp,ok,actual,expected});
              emit(`OHPTCASE check id=${c.id} cp=${cp} ok=${ok?1:0} expect=${token(expected ?? '')} actual=${token(actual)}`);
            }})).then(
              (v) => { if (current === cur) current = null; clearTimeout(cur.timer); resolve(v); },
              (e) => { if (current === cur) current = null; clearTimeout(cur.timer); reject(e); }
            );
          });
          const count = doc.stage === 6 ? (c.steps || []).length : 0;
          const complete = doc.stage !== 6 ? checks.length > 0 : count > 0 && Array.from({length:count},(_,i)=>i).every(cp=>checks.some(v=>v.cp===cp));
          result = checks.some(v=>!v.ok) ? 'fail' : complete ? 'pass' : 'blocked';
          detail = complete ? '' : '检查点未完成；人工观察须按原流程另行记录';
        } catch (e) { result = 'fail'; detail = String(e.stack || e); }
      }
      emit(`OHPTCASE result=${result} id=${c.id} detail=${token(detail)}`);
      results.push({id:c.id,name:c.name,result,detail,checks});
    }
  } finally {
    process.removeListener('uncaughtException', onUncaught);
    process.removeListener('unhandledRejection', onUnhandled);
  }
  emit(`OHPTCASE summary total=${results.length} pass=${results.filter(r=>r.result==='pass').length} fail=${results.filter(r=>r.result==='fail').length} pending=${results.filter(r=>r.result==='blocked').length}`);
  return results;
}
module.exports = {runSuite};
