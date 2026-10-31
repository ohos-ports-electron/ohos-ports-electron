'use strict';
// Port regression entry: load the installed @ohos-ports-electron/vscode-textmate and run the
// shared 9-case public-API assertion suite (same assertions used for device verification).
// Host regression only — real device evidence lives in first-stage reports/ (see release-evidence.json).
const suite = require('./assertions.cjs');

async function main() {
  const results = [];
  let pass = 0, fail = 0;
  for (const [id, fn] of Object.entries(suite)) {
    const checks = [];
    try {
      await fn({
        case: { id },
        check(cp, ok, actual, expected) { checks.push({ cp, ok, actual, expected }); },
      });
      const r = checks.some(c => !c.ok) ? 'fail' : 'pass';
      if (r === 'pass') pass++; else fail++;
      results.push({ id, result: r, checks: checks.length });
    } catch (e) {
      fail++;
      results.push({ id, result: 'fail', error: String(e) });
    }
  }
  console.log(JSON.stringify({ total: results.length, pass, fail, results }, null, 2));
  if (fail) process.exitCode = 1;
}

main();
