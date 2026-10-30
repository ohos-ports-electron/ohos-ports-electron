'use strict';
// Host contract assertions: ordinary install + load + the shared 6-case assertion suite
// resolve on the CI host (Linux/Windows). HarmonyOS device platform semantics are recorded
// in release-evidence.json from first-stage device runs (6/6 x 2 cold starts per role). No mock.
// 上游 test.js 断言一一对应（parse/sort/match tags、parse/sort/match tuples）。
const suite = require('../tests/assertions.cjs');

module.exports = async () => {
  const results = [];
  let pass = 0;
  for (const [id, fn] of Object.entries(suite)) {
    const checks = [];
    try {
      await fn({
        case: { id },
        check(cp, ok, actual, expected) { checks.push({ cp, ok, actual: String(actual).slice(0, 160), expected: String(expected).slice(0, 160) }); },
      });
      const ok = checks.length > 0 && checks.every(c => c.ok);
      if (ok) pass++;
      results.push({ id, ok, checks: checks.length });
    } catch (e) {
      results.push({ id, ok: false, error: String(e).slice(0, 200) });
    }
  }
  const total = results.length;
  return { pass, total, fail: total - pass, results };
};
