'use strict';
/* Host-safe regression suite for @ohos-ports-electron/prebuild-install (CI compatibility job).
 * Runs on plain Node (Linux CI) against the installed candidate tgz. Cases mirror the
 * device roster's host-safe subset (pure url/util/log/rc/CLI-version assertions) plus
 * package identity and unchanged distributed JS hashes. No device, network, nock or
 * N-API fixture behavior is claimed; the network/fixture cases stay in the device roster. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const childProcess = require('child_process');

const definitions = [
  ['package identity', async c => c.equal(JSON.parse(fs.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).name, c.config.packageName)],
  ['unchanged distributed JavaScript', async c => {
    const hashes = {};
    for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(c.pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel);
      hashes[rel] = actual;
    }
    c.equal(Object.keys(hashes).length, Object.keys(c.config.libraryFiles).length);
  }],
  ['index.js exports download', async c => {
    const mod = c.require(c.config.packageName);
    c.equal(typeof mod.download, 'function');
  }],
  ['util.urlTemplate returns explicit download string', async c => {
    const util = c.require(path.join(c.pkg, 'util.js'));
    c.equal(util.urlTemplate({download: 'd0000d'}), 'd0000d');
  }],
  ['util.urlTemplate falls back to pkg.binary.host template', async c => {
    const util = c.require(path.join(c.pkg, 'util.js'));
    const t = util.urlTemplate({pkg: {binary: {host: 'http://foo.com'}}});
    c.equal(t, 'http://foo.com/{name}-v{version}-{runtime}-v{abi}-{platform}{libc}-{arch}.tar.gz');
  }],
  ['util.getDownloadUrl expands the full tuple', async c => {
    const util = c.require(path.join(c.pkg, 'util.js'));
    const abi = process.versions.modules;
    const url = util.getDownloadUrl({
      pkg: {name: 'a-native-module', version: '1.0.0', binary: {host: 'https://foo.com', module_name: 'a-native-module-bindings', package_name: '{name}-{version}-{abi}-{platform}-{arch}'}},
      platform: 'linux', arch: 'x64'
    });
    c.equal(url, 'https://foo.com/a-native-module-1.0.0-' + abi + '-linux-x64');
  }],
  ['util.cachedPrebuild builds the cache filename', async c => {
    const util = c.require(path.join(c.pkg, 'util.js'));
    const cached = util.cachedPrebuild('https://github.com/level/leveldown/releases/download/v1.4.0/leveldown-v1.4.0-node-v14-linux-x64.tar.gz');
    c.equal(typeof cached, 'string');
    c.equal(cached.includes('_prebuilds'), true);
  }],
  ['util.localPrebuild honors the option override', async c => {
    const util = c.require(path.join(c.pkg, 'util.js'));
    const url = 'https://github.com/a-native-module/a-native-module/releases/download/v1.4.0/a-native-module-v1.4.0-node-v14-linux-x64.tar.gz';
    const local = util.localPrebuild(url, {pkg: {name: 'a-native-module'}, 'local-prebuilds': path.join('p', 'prebuilds')});
    c.equal(local, path.join('p', 'prebuilds', 'a-native-module-v1.4.0-node-v14-linux-x64.tar.gz'));
  }],
  ['rc merges external package config', async c => {
    const rc = c.require(path.join(c.pkg, 'rc.js'));
    const merged = rc({config: {target: '1.0.0', runtime: 'electron', arch: 'woohoo-arch'}});
    c.equal(merged.target, '1.0.0');
    c.equal(merged.runtime, 'electron');
    c.equal(merged.arch, 'woohoo-arch');
  }],
  ['log prefix is fixed prebuild-install', async c => {
    const log = c.require(path.join(c.pkg, 'log.js'));
    const l = log({verbose: false, verboseFlag: false}, {npm_config_loglevel: 'info'});
    const lines = [];
    const saved = console.error;
    try {
      console.error = x => lines.push(x);
      l.info('test', 'hello');
    } finally { console.error = saved; }
    c.equal(lines.length > 0 && lines[0].startsWith('prebuild-install info'), true);
  }],
  ['bin --version prints the package version', async c => {
    const bin = path.join(c.pkg, 'bin.js');
    const out = childProcess.execFileSync(process.execPath, [bin, '--version'], {cwd: c.root, encoding: 'utf8'});
    c.equal(out.trim(), c.config.packageVersion);
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString();
  const runId = crypto.randomBytes(12).toString('hex');
  const results = [];
  let pkg, loadError;
  try {
    const lib = require.resolve(config.packageName);
    let d = path.dirname(lib);
    for (;;) {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
        if (meta.name === config.packageName) { pkg = d; break; }
      } catch (_) { /* keep walking */ }
      const up = path.dirname(d);
      if (up === d) throw new Error('package root not found for ' + config.packageName);
      d = up;
    }
  } catch (e) { loadError = e; }
  const root = path.join(outputDir, 'prebuild-install-' + process.pid + '-' + runId);
  fs.mkdirSync(root, {recursive: true});
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name: 'pbi-host', version: '1.0.0', private: true}));
  for (const [name, body] of definitions) {
    const start = Date.now();
    let expected = null, actual = null, status = 'passed', error = null;
    let assertions = 0;
    const context = {
      pkg, config, root,
      require: m => require(m),
      equal: (a, b) => { expected = b; actual = a; assertions++; assert.deepStrictEqual(a, b); },
    };
    try {
      if (loadError) throw loadError;
      await body(context);
      assert(assertions > 0, 'case did not record an assertion');
    } catch (e) {
      status = 'failed';
      error = {name: e.name, code: e.code, message: e.message, stack: e.stack};
    }
    results.push({name, status, expected, actual, durationMs: Date.now() - start, error});
    console.log('PBI_CASE ' + JSON.stringify({runId, pid: process.pid, ...results[results.length - 1]}));
  }
  let cleanupError = null;
  try { fs.rmSync(root, {recursive: true, force: true}); } catch (e) { cleanupError = String(e); }
  const report = {
    runId, pid: process.pid, startedAt, finishedAt: new Date().toISOString(),
    packageSha256: config.packageSha256, packageName: config.packageName, packageVersion: config.packageVersion,
    phase: config.phase, targetId: config.targetId,
    versions: process.versions, platform: process.platform, arch: process.arch,
    expectedTotal: definitions.length, total: results.length,
    pass: results.filter(x => x.status === 'passed').length,
    fail: results.filter(x => x.status === 'failed').length,
    notRun: 0, results, cleanupError,
  };
  report.status = report.fail === 0 && !cleanupError ? 'passed' : 'failed';
  const json = JSON.stringify(report, null, 2);
  fs.mkdirSync(outputDir, {recursive: true});
  fs.writeFileSync(path.join(outputDir, runId + '.json.tmp'), json);
  fs.renameSync(path.join(outputDir, runId + '.json.tmp'), path.join(outputDir, runId + '.json'));
  fs.writeFileSync(path.join(outputDir, 'latest.json.tmp'), json);
  fs.renameSync(path.join(outputDir, 'latest.json.tmp'), path.join(outputDir, 'latest.json'));
  console.log('PBI_DONE ' + JSON.stringify({runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total}));
  return report;
}
module.exports = {run, definitions};
