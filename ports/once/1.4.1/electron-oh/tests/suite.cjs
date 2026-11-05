'use strict';
/* Host-safe regression suite for @ohos-ports-electron/once (CI compatibility job).
 * Runs on plain Node (Linux CI) against the installed candidate tgz.
 * Cases mirror the device roster (all 6 upstream tap cases are platform-independent:
 * the 1000-call cache loop, fn.once()/fn.onceStrict() proto helpers, strict re-call
 * errors with named/anonymous/custom messages, property forwarding) plus package
 * identity and unchanged distributed JS hash. once is CommonJS (main once.js). */
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const definitions = [
  ['package identity', async c => c.equal(JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).name, c.config.packageName)],
  ['unchanged distributed JavaScript', async c => {
    const hashes = {}; for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel); hashes[rel] = actual;
    } c.equal(Object.keys(hashes).length, Object.keys(c.config.libraryFiles).length);
  }],
  ['once(fn) 1000-call cache loop', async c => {
    let f = 0; let firstCallSawF0 = null;
    function fn(g) { firstCallSawF0 = (f === 0); f++; return f + g + this; }
    fn.ownProperty = {};
    const foo = c.once(fn);
    c.equal(fn.ownProperty === foo.ownProperty, true);
    c.equal(foo.called, false);
    for (let i = 0; i < 1E3; i++) {
      const fBefore = f;
      const preOk = (fBefore === (i === 0 ? 0 : 1));
      const g = foo.call(1, 1);
      assert(preOk && firstCallSawF0 === true && foo.called === true && g === 3 && f === 1, 'cache loop invariant broken at ' + i);
    }
    c.equal(f, 1);
  }],
  ['fn.once() proto helper', async c => {
    c.once.proto();
    let f = 0; let firstCallSawF0 = null;
    function fn(g) { firstCallSawF0 = (f === 0); f++; return f + g + this; }
    const foo = fn.once();
    c.equal(foo.called, false);
    for (let i = 0; i < 1E3; i++) {
      const fBefore = f;
      const preOk = (fBefore === (i === 0 ? 0 : 1));
      const g = foo.call(1, 1);
      assert(preOk && firstCallSawF0 === true && foo.called === true && g === 3 && f === 1, 'fn.once loop broken at ' + i);
    }
    c.equal(f, 1);
  }],
  ['once.strict with named function', async c => {
    let f = 0; let firstCallSawF0 = null;
    function fn(g) { firstCallSawF0 = (f === 0); f++; return f + g + this; }
    fn.ownProperty = {};
    const foo = c.once.strict(fn);
    c.equal(fn.ownProperty === foo.ownProperty, true);
    c.equal(foo.called, false);
    const g = foo.call(1, 1);
    c.equal(g === 3 && firstCallSawF0 === true, true);
    c.equal(foo.called, true);
    c.equal(f, 1);
    let threw = null; try { foo.call(2, 2); } catch (e) { threw = e; }
    c.equal(threw instanceof Error, true);
    c.equal(threw && threw.message, "fn shouldn't be called more than once");
  }],
  ['fn.onceStrict() proto helper', async c => {
    c.once.proto();
    let f = 0;
    function fn(g) { f++; return f + g + this; }
    const foo = fn.onceStrict(fn);
    c.equal(foo.called, false);
    const g = foo.call(1, 1);
    c.equal(g, 3);
    c.equal(foo.called, true);
    c.equal(f, 1);
    let threw = null; try { foo.call(2, 2); } catch (e) { threw = e; }
    c.equal(threw instanceof Error, true);
    c.equal(threw && threw.message, "fn shouldn't be called more than once");
  }],
  ['once.strict with anonymous function', async c => {
    const foo = c.once.strict(function (g) { return g + 1; });
    c.equal(foo.called, false);
    const g = foo(1);
    c.equal(g, 2);
    c.equal(foo.called, true);
    let threw = null; try { foo(2); } catch (e) { threw = e; }
    c.equal(threw instanceof Error, true);
    c.equal(threw && threw.message, "Function wrapped with `once` shouldn't be called more than once");
  }],
  ['once.strict with custom error message', async c => {
    const foo = c.once.strict(function (g) { return g + 1; });
    foo.onceError = 'foo error';
    c.equal(foo.called, false);
    const g = foo(1);
    c.equal(g, 2);
    c.equal(foo.called, true);
    let threw = null; try { foo(2); } catch (e) { threw = e; }
    c.equal(threw instanceof Error, true);
    c.equal(threw && threw.message, 'foo error');
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let once; let pkg; let loadError;
  try {
    once = require(config.packageName);
    let d = path.dirname(require.resolve(config.packageName));
    for (;;) {
      try {
        const meta = JSON.parse(native.readFileSync(path.join(d, 'package.json'), 'utf8'));
        if (meta.name === config.packageName) { pkg = d; break; }
      } catch (_) { /* keep walking */ }
      const up = path.dirname(d);
      if (up === d) throw new Error('package root not found for ' + config.packageName);
      d = up;
    }
  } catch (e) { loadError = e; }
  const root = path.join(outputDir, 'once-' + process.pid + '-' + runId); native.mkdirSync(root, { recursive: true });
  for (const [name, body] of definitions) {
    const start = Date.now(); let expected = null, actual = null, status = 'passed', error = null, skipReason = null; let assertions = 0;
    const context = {
      once, pkg, config, root, p: s => path.join(root, s),
      equal: (a, b) => { expected = b; actual = a; assertions++; assert.deepStrictEqual(a, b); },
      record: (e, a) => { expected = e; actual = a; assertions++; },
      skip: (reason) => { skipReason = reason; },
    };
    try { if (loadError) throw loadError; await body(context); if (skipReason) { status = 'not-run'; } else { assert(assertions > 0, 'case did not record an assertion'); } } catch (e) { status = 'failed'; error = { name: e.name, code: e.code, message: e.message, stack: e.stack }; }
    const result = { name, status, expected, actual, durationMs: Date.now() - start, error, skipReason }; results.push(result);
    console.log('ONCE_CASE ' + JSON.stringify({ runId, pid: process.pid, ...result }));
  }
  let cleanupError = null; try { native.rmSync(root, { recursive: true, force: true }); } catch (e) { cleanupError = String(e); }
  const report = {
    runId, pid: process.pid, startedAt, finishedAt: new Date().toISOString(), packageSha256: config.packageSha256,
    packageName: config.packageName, packageVersion: config.packageVersion, phase: config.phase, targetId: config.targetId,
    versions: process.versions, platform: process.platform, arch: process.arch, expectedTotal: definitions.length,
    total: results.length, pass: results.filter(x => x.status === 'passed').length, fail: results.filter(x => x.status === 'failed').length,
    notRun: results.filter(x => x.status === 'not-run').length, results, cleanupError,
  };
  report.status = report.fail === 0 && !cleanupError ? 'passed' : 'failed';
  const json = JSON.stringify(report, null, 2); native.mkdirSync(outputDir, { recursive: true });
  native.writeFileSync(path.join(outputDir, runId + '.json.tmp'), json); native.renameSync(path.join(outputDir, runId + '.json.tmp'), path.join(outputDir, runId + '.json'));
  native.writeFileSync(path.join(outputDir, 'latest.json.tmp'), json); native.renameSync(path.join(outputDir, 'latest.json.tmp'), path.join(outputDir, 'latest.json'));
  console.log('ONCE_DONE ' + JSON.stringify({ runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total }));
  return report;
}
module.exports = { run, definitions };
