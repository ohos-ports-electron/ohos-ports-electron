'use strict';
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

// vuex-electron is electron-only (top-level require('electron')/electron-store), so the
// host regression verifies the distributed bytes, identity and install contract WITHOUT
// loading the library (functional load is device-recorded: 26/26 x2 cold starts per
// electron target in release-evidence.json). No mock, no simulated device pass.

const definitions = [
  ['package identity', async c => c.equal(JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).name, c.config.packageName)],
  ['package version', async c => c.equal(JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).version, c.config.packageVersion)],
  ['unchanged distributed JavaScript', async c => {
    const hashes = {}; for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel); hashes[rel] = actual;
    } c.equal(Object.keys(hashes).length, Object.keys(c.config.libraryFiles).length);
  }],
  ['repository identity', async c => {
    const repo = JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).repository;
    c.equal(repo.directory, 'ports/vuex-electron/1.0.3');
  }],
  ['no install lifecycle scripts', async c => {
    const scripts = JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).scripts || {};
    const forbidden = Object.keys(scripts).filter(k => ['preinstall', 'install', 'postinstall'].includes(k));
    c.equal(forbidden, []);
  }],
  ['dist entry point exists', async c => {
    const main = JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).main;
    c.equal(native.existsSync(path.join(c.pkg, main)), true);
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let pkg;
  try { pkg = path.dirname(require.resolve(config.packageName + '/package.json')); }
  catch (e) { pkg = null; }
  const root = path.join(outputDir, 'vuex-electron-' + process.pid + '-' + runId); native.mkdirSync(root, { recursive: true });
  for (const [name, body] of definitions) {
    const start = Date.now(); let expected = null, actual = null, status = 'passed', error = null; let assertions = 0;
    const context = {
      pkg, config, root, p: s => path.join(root, s),
      equal: (a, b) => { expected = b; actual = a; assertions++; assert.deepStrictEqual(a, b); },
      record: (e, a) => { expected = e; actual = a; assertions++; },
    };
    try { if (!pkg) throw Error('package not installed'); await body(context); assert(assertions > 0, 'case did not record an assertion'); } catch (e) { status = 'failed'; error = { name: e.name, code: e.code, message: e.message, stack: e.stack }; }
    const result = { name, status, expected, actual, durationMs: Date.now() - start, error }; results.push(result);
    console.log('VUEX_ELECTRON_CASE ' + JSON.stringify({ runId, pid: process.pid, ...result }));
  }
  let cleanupError = null; try { native.rmSync(root, { recursive: true, force: true }); } catch (e) { cleanupError = String(e); }
  const report = {
    runId, pid: process.pid, startedAt, finishedAt: new Date().toISOString(), packageSha256: config.packageSha256,
    packageName: config.packageName, packageVersion: config.packageVersion, phase: config.phase, targetId: config.targetId,
    versions: process.versions, platform: process.platform, arch: process.arch, expectedTotal: definitions.length,
    total: results.length, pass: results.filter(x => x.status === 'passed').length, fail: results.filter(x => x.status === 'failed').length,
    notRun: 0, results, cleanupError,
  };
  report.status = report.fail === 0 && !cleanupError ? 'passed' : 'failed';
  const json = JSON.stringify(report, null, 2); native.mkdirSync(outputDir, { recursive: true });
  native.writeFileSync(path.join(outputDir, runId + '.json.tmp'), json); native.renameSync(path.join(outputDir, runId + '.json.tmp'), path.join(outputDir, runId + '.json'));
  native.writeFileSync(path.join(outputDir, 'latest.json.tmp'), json); native.renameSync(path.join(outputDir, 'latest.json.tmp'), path.join(outputDir, 'latest.json'));
  console.log('VUEX_ELECTRON_DONE ' + JSON.stringify({ runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total }));
  return report;
}
module.exports = { run, definitions };
