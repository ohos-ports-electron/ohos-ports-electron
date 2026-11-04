'use strict';
/* Host-safe regression suite for @ohos-ports-electron/env-paths (CI compatibility job).
 * Runs on plain Node (Linux CI) against the installed candidate tgz.
 * Cases mirror the device roster's host-safe subset (default / custom / no suffix,
 * invalid name/suffix rejection, XDG_*_HOME override) plus package identity and
 * unchanged distributed JS hashes. No device or OHOS-specific behavior is claimed. */
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

function assertThrowsUnsafe(fn) {
  try {
    fn();
    return {ok: false, actual: 'no-throw'};
  } catch (e) {
    return {ok: /Unsafe filename/.test(String(e.message)), actual: String(e.message)};
  }
}

const definitions = [
  ['package identity', async c => c.equal(JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).name, c.config.packageName)],
  ['unchanged distributed JavaScript', async c => {
    const hashes = {}; for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel); hashes[rel] = actual;
    } c.equal(Object.keys(hashes).length, Object.keys(c.config.libraryFiles).length);
  }],
  ['default suffix nodejs, five path kinds end with <name>-nodejs', async c => {
    if (process.platform !== 'linux') return c.skip('linux-branch assertion; host runs the CI linux platform');
    const paths = c.envPaths('unicorn');
    let cp = 0;
    for (const [key, value] of Object.entries(paths)) {
      c.equal(Boolean(value.endsWith('unicorn-nodejs')), true);
      cp++;
    }
    assert(cp === 5, 'expected 5 path kinds');
  }],
  ['custom suffix horn', async c => {
    if (process.platform !== 'linux') return c.skip('linux-branch assertion');
    const paths = c.envPaths('unicorn', {suffix: 'horn'});
    c.equal(paths.data.endsWith('unicorn-horn'), true);
  }],
  ['no suffix disables the suffix segment', async c => {
    if (process.platform !== 'linux') return c.skip('linux-branch assertion');
    const paths = c.envPaths('unicorn', {suffix: ''});
    c.equal(paths.data.endsWith('unicorn'), true);
  }],
  ['rejects invalid name', async c => {
    for (const bad of ['../../x', '../foo/bar', 'foo/bar', '']) {
      const r = assertThrowsUnsafe(() => c.envPaths(bad));
      c.equal(r.ok, true);
    }
  }],
  ['rejects invalid suffix', async c => {
    for (const bad of ['../x', 'foo/bar']) {
      const r = assertThrowsUnsafe(() => c.envPaths('myapp', {suffix: bad}));
      c.equal(r.ok, true);
    }
  }],
  ['correct paths with XDG_*_HOME set', async c => {
    if (process.platform !== 'linux') return c.skip('linux-branch assertion');
    const envVars = {data: 'XDG_DATA_HOME', config: 'XDG_CONFIG_HOME', cache: 'XDG_CACHE_HOME', log: 'XDG_STATE_HOME'};
    const saved = {};
    for (const v of Object.values(envVars)) { saved[v] = process.env[v]; process.env[v] = path.join(c.root, v); }
    try {
      const paths = c.envPaths('unicorn');
      for (const envKey of Object.keys(envVars)) {
        const expected = process.env[envVars[envKey]];
        c.equal(paths[envKey].startsWith(expected) && paths[envKey].endsWith('unicorn-nodejs'), true);
      }
    } finally {
      for (const v of Object.values(envVars)) {
        if (saved[v] === undefined) delete process.env[v];
        else process.env[v] = saved[v];
      }
    }
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let envPaths; let pkg; let loadError;
  try {
    // env-paths is ESM: dynamic import the installed candidate, resolve its package root.
    const m = await import(config.packageName);
    envPaths = m.default;
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
  const root = path.join(outputDir, 'env-paths-' + process.pid + '-' + runId); native.mkdirSync(root, { recursive: true });
  for (const [name, body] of definitions) {
    const start = Date.now(); let expected = null, actual = null, status = 'passed', error = null, skipReason = null; let assertions = 0;
    const context = {
      envPaths, pkg, config, root, p: s => path.join(root, s),
      equal: (a, b) => { expected = b; actual = a; assertions++; assert.deepStrictEqual(a, b); },
      record: (e, a) => { expected = e; actual = a; assertions++; },
      skip: (reason) => { skipReason = reason; },
    };
    try { if (loadError) throw loadError; await body(context); if (skipReason) { status = 'not-run'; } else { assert(assertions > 0, 'case did not record an assertion'); } } catch (e) { status = 'failed'; error = { name: e.name, code: e.code, message: e.message, stack: e.stack }; }
    const result = { name, status, expected, actual, durationMs: Date.now() - start, error, skipReason }; results.push(result);
    console.log('ENVPATHS_CASE ' + JSON.stringify({ runId, pid: process.pid, ...result }));
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
  console.log('ENVPATHS_DONE ' + JSON.stringify({ runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total }));
  return report;
}
module.exports = { run, definitions };
