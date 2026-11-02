'use strict';
// Host contract assertions: ordinary (--ignore-scripts) install + load + the shared 2-case assertion suite
// resolve on the CI host (Linux/Windows). HarmonyOS device platform semantics are recorded
// in release-evidence.json from first-stage device runs (2/2 x 2 cold starts per role). No mock.
// --ignore-scripts 原因：库含 binding.gyp，npm 默认 install 会触发 node-gyp rebuild（win32 真实 addon /
// 其他平台占位编译）。addon 在非 win32 平台永不加载（JS 平台守卫），宿主回归只验证 JS 契约；
// 真实 node-gyp 编译路径由上游 CI 背书，鸿蒙侧消费经 tarball 装配（第一阶段设备矩阵已实证 2/2 x2 x4 角色）。
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
