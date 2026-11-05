'use strict';
/* Host-safe regression suite for @ohos-ports-electron/napi-build-utils (CI compatibility job).
 * Runs on plain Node (Linux CI + Windows) against the installed candidate tgz.
 * Cases mirror the device roster's 8-case upstream suite and package identity checks.
 * No device or OHOS-specific behavior is claimed. */
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

async function run(config, outDir) {
  // napi-build-utils reads `binary.napi_versions` from the process CWD package.json
  // at module load time (index.js:5). Seed the CWD package manifest so the host
  // regression matches the device harness (library source unchanged).
  const cwdPkg = path.join(process.cwd(), 'package.json');
  if (native.existsSync(cwdPkg)) {
    const pj = JSON.parse(native.readFileSync(cwdPkg, 'utf8'));
    pj.binary = { note: 'napi-build-tools is not an N-API module. This entry is for unit testing.', napi_versions: [2, 2, 3, 10] };
    native.writeFileSync(cwdPkg, JSON.stringify(pj, null, 2));
  }
  const pkg = path.dirname(require.resolve(config.packageName + '/package.json'));
  const lib = require(config.packageName);
  const napiRaw = lib.getNapiVersion();
  const napi = napiRaw == null ? NaN : parseInt(napiRaw, 10);
  const results = [];
  const failures = [];
  const t = (name, fn) => {
    try { fn(); results.push({ name, status: 'passed' }); }
    catch (e) { results.push({ name, status: 'failed', error: String(e).slice(0, 300) }); failures.push(name + ': ' + String(e).slice(0, 300)); }
  };
  t('package identity', () => {
    assert.strictEqual(JSON.parse(native.readFileSync(path.join(pkg, 'package.json'), 'utf8')).name, config.packageName);
  });
  t('unchanged distributed JavaScript', () => {
    for (const [rel, expected] of Object.entries(config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel);
    }
  });
  t('isNapiRuntime', () => {
    assert.strictEqual(lib.isNapiRuntime('napi'), true);
    assert.strictEqual(lib.isNapiRuntime('n-api'), false);
  });
  t('getNapiVersion', () => {
    assert.strictEqual(lib.getNapiVersion(), process.versions.napi);
  });
  t('getNapiBuildVersions', () => {
    const v = lib.getNapiBuildVersions();
    assert.deepStrictEqual(v, ['2', '3', '10']);
  });
  t('packageSupportsVersion', () => {
    assert.strictEqual(lib.packageSupportsVersion(1), false);
    assert.strictEqual(lib.packageSupportsVersion(2), true);
    assert.strictEqual(lib.packageSupportsVersion(3), true);
    assert.strictEqual(lib.packageSupportsVersion(4), false);
  });
  t('isSupportedVersion', () => {
    assert.strictEqual(lib.isSupportedVersion('1'), false);
    assert.strictEqual(lib.isSupportedVersion('2'), napi >= 2);
    assert.strictEqual(lib.isSupportedVersion('3'), napi >= 3);
    assert.strictEqual(lib.isSupportedVersion('4'), false);
  });
  t('getBestNapiBuildVersion', () => {
    const expected = napi >= 10 ? 10 : (napi >= 3 ? 3 : (napi === 2 ? 2 : undefined));
    assert.strictEqual(lib.getBestNapiBuildVersion(), expected);
  });
  t('logUnsupportedVersion', () => {
    const mk = () => ({ contents: [], warn(m) { this.contents.push(m); } });
    const l1 = mk(); lib.logUnsupportedVersion('1', l1);
    assert.strictEqual(l1.contents.length, 1);
    const l2 = mk(); lib.logUnsupportedVersion('2', l2);
    assert.strictEqual(l2.contents.length, napi >= 2 ? 0 : 1);
    const l3 = mk(); lib.logUnsupportedVersion('3', l3);
    assert.strictEqual(l3.contents.length, napi >= 3 ? 0 : 1);
    const l4 = mk(); lib.logUnsupportedVersion('4', l4);
    assert.strictEqual(l4.contents.length, 1);
  });
  t('logMissingNapiVersions', () => {
    const prebuild = [];
    if (napi >= 2) prebuild.push({ runtime: 'napi', target: '2' });
    if (napi >= 3) prebuild.push({ runtime: 'napi', target: '3' });
    const mk = () => ({ contents: [], warn(m) { this.contents.push(m); } });
    const l1 = mk(); lib.logMissingNapiVersions('1', prebuild, l1);
    assert.strictEqual(l1.contents.length, 1);
    const l2 = mk(); lib.logMissingNapiVersions('2', prebuild, l2);
    assert.strictEqual(l2.contents.length, napi >= 2 ? 0 : 1);
    const l3 = mk(); lib.logMissingNapiVersions('3', prebuild, l3);
    assert.strictEqual(l3.contents.length, napi >= 3 ? 0 : 1);
    const l4 = mk(); lib.logMissingNapiVersions('4', prebuild, l4);
    assert.strictEqual(l4.contents.length, 1);
  });
  const total = results.length;
  const status = failures.length === 0 ? 'passed' : 'failed';
  const summary = { packageName: config.packageName, packageVersion: config.packageVersion, packageSha256: config.packageSha256, total, pass: results.filter(r => r.status === 'passed').length, fail: failures.length, results, status };
  if (outDir) {
    native.mkdirSync(outDir, { recursive: true });
    native.writeFileSync(path.join(outDir, 'host-suite.json'), JSON.stringify(summary, null, 2));
  }
  if (status !== 'passed') {
    console.error(failures.join('\n'));
  }
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

module.exports = { run };
