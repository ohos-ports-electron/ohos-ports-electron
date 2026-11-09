'use strict';
/* Host-safe regression suite for @ohos-ports-electron/electron-is-dev (CI compatibility job).
 * Runs on plain Node (Linux CI) against the installed candidate tgz.
 * electron-is-dev is electron-only, so a real device/Electron run is the only place the
 * boolean value is observed; on plain Node this suite replays the host-safe subset:
 *   - package identity,
 *   - unchanged distributed JavaScript hashes,
 *   - the non-Electron guard: an `electron` string-resolution fixture (the npm electron
 *     package shape on a plain Node host) makes the library throw
 *     TypeError('Not running in an Electron environment!') exactly as upstream.
 * The env/isPackaged value cases are covered only by the device roster (real Electron-OH). */
const native = require('fs');
const path = require('path');
const crypto = require('crypto');
const {pathToFileURL} = require('url');

function findPkgRoot(pkgJsonPath) {
  let d = path.dirname(pkgJsonPath);
  for (;;) {
    try {
      const meta = JSON.parse(native.readFileSync(path.join(d, 'package.json'), 'utf8'));
      if (meta.name) return {dir: d, meta};
    } catch (_) { /* keep walking */ }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

function installElectronStringStub() {
  const stubDir = path.join(process.cwd(), 'node_modules', 'electron');
  native.mkdirSync(stubDir, {recursive: true});
  native.writeFileSync(path.join(stubDir, 'package.json'), JSON.stringify({name: 'electron', version: '0.0.0-fixture', main: 'index.js'}) + '\n');
  native.writeFileSync(path.join(stubDir, 'index.js'), "'use strict';\nmodule.exports = 'electron-fixture-path';\n");
  return stubDir;
}

const THROW_EXPECTED = 'TypeError: Not running in an Electron environment!';

const definitions = [
  ['package identity', async c => {
    c.equal(c.pkg.meta.name, c.config.packageName);
  }],
  ['unchanged distributed JavaScript', async c => {
    let n = 0;
    for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg.dir, rel))).digest('hex');
      c.equal(actual, expected); n++;
    }
    c.equal(n, Object.keys(c.config.libraryFiles).length);
  }],
  ['rejects non-electron host', async c => {
    installElectronStringStub();
    try {
      await import(pathToFileURL(path.join(c.pkg.dir, 'index.js')).href + '?hostcase=guard');
      c.equal('no-throw', THROW_EXPECTED);
    } catch (error) {
      const actual = `${error && error.constructor && error.constructor.name}: ${error && error.message}`;
      c.equal(actual, THROW_EXPECTED);
    }
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let pkg = null; let loadError;
  try {
    const resolved = require.resolve(config.packageName);
    pkg = findPkgRoot(resolved);
    if (!pkg) throw new Error('package root not found for ' + config.packageName);
  } catch (e) { loadError = e; }
  const root = path.join(outputDir, 'isdev-host-' + process.pid + '-' + runId); native.mkdirSync(root, {recursive: true});
  for (const [name, body] of definitions) {
    const start = Date.now(); let expected = null, actual = null, status = 'passed', error = null; let assertions = 0;
    const context = {
      pkg, config, root,
      equal: (a, b) => { expected = b; actual = a; assertions++; require('assert').deepStrictEqual(a, b); },
    };
    try { if (loadError) throw loadError; await body(context); require('assert')(assertions > 0, 'case did not record an assertion'); } catch (e) { status = 'failed'; error = {name: e.name, code: e.code, message: e.message, stack: e.stack}; }
    results.push({name, status, expected, actual, durationMs: Date.now() - start, error});
    console.log('ISDEV_CASE ' + JSON.stringify({runId, pid: process.pid, name, status}));
  }
  const report = {
    runId, pid: process.pid, startedAt, finishedAt: new Date().toISOString(), packageSha256: config.packageSha256,
    packageName: config.packageName, packageVersion: config.packageVersion, phase: config.phase, targetId: config.targetId,
    versions: process.versions, platform: process.platform, arch: process.arch, expectedTotal: definitions.length,
    total: results.length, pass: results.filter(x => x.status === 'passed').length, fail: results.filter(x => x.status === 'failed').length,
    results,
  };
  report.status = report.fail === 0 ? 'passed' : 'failed';
  const json = JSON.stringify(report, null, 2); native.mkdirSync(outputDir, {recursive: true});
  native.writeFileSync(path.join(outputDir, runId + '.json.tmp'), json); native.renameSync(path.join(outputDir, runId + '.json.tmp'), path.join(outputDir, runId + '.json'));
  native.writeFileSync(path.join(outputDir, 'latest.json.tmp'), json); native.renameSync(path.join(outputDir, 'latest.json.tmp'), path.join(outputDir, 'latest.json'));
  console.log('ISDEV_DONE ' + JSON.stringify({runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total}));
  return report;
}
module.exports = {run, definitions};
