'use strict';
/* Host-safe regression suite for @ohos-ports-electron/7zip-bin (CI compatibility job).
 * Runs on plain Node (Linux CI) against the installed candidate tgz.
 * Cases mirror the device roster's host-safe subset: package identity, unchanged
 * distributed JS hashes, path7za resolution, and real 7za archive operations
 * (version / create / extract roundtrip / list) against the linux/x64/7za payload
 * on the CI linux platform. No device or OHOS-specific behavior is claimed. */
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const os = require('os');
const {execFileSync} = require('node:child_process');

function run7za(bin, args) {
  try {
    const out = execFileSync(bin, args, {encoding: 'utf8', timeout: 60000});
    return {ok: true, out: String(out)};
  } catch (e) {
    const partial = e && e.stdout ? String(e.stdout) : '';
    return {ok: false, out: partial || String(e && e.code || e && e.message || e)};
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
  ['path7za resolves to a shipped 7za on this host platform', async c => {
    const p7z = c.pkg7za;
    c.equal(typeof p7z === 'string' && p7z.length > 0, true);
    if (process.platform !== 'linux') return c.skip('linux-branch assertion; host CI runs linux');
    c.equal(p7z.endsWith(path.join('linux', process.arch, '7za')), true);
    c.equal(native.existsSync(p7z), true);
  }],
  ['7za runs and prints 7-Zip banner', async c => {
    if (process.platform !== 'linux') return c.skip('exec assertion requires the CI linux platform payload');
    const r = run7za(c.pkg7za, ['i']);
    c.equal(r.ok, true);
    c.equal(r.out.includes('7-Zip'), true);
  }],
  ['create archive then list contains the input name', async c => {
    if (process.platform !== 'linux') return c.skip('exec assertion requires the CI linux platform payload');
    const dir = native.mkdtempSync(path.join(os.tmpdir(), '7z-host-create-'));
    try {
      const input = path.join(dir, 'input.txt');
      const archive = path.join(dir, 'out.7z');
      native.writeFileSync(input, '7zip-bin host create sample\n', 'utf8');
      const add = run7za(c.pkg7za, ['a', archive, input]);
      c.equal(add.ok, true);
      c.equal(native.existsSync(archive) && native.statSync(archive).size > 0, true);
      const list = run7za(c.pkg7za, ['l', archive]);
      c.equal(list.ok && list.out.includes('input.txt'), true);
    } finally { native.rmSync(dir, {recursive: true, force: true}); }
  }],
  ['extract roundtrip is byte-equal', async c => {
    if (process.platform !== 'linux') return c.skip('exec assertion requires the CI linux platform payload');
    const dir = native.mkdtempSync(path.join(os.tmpdir(), '7z-host-round-'));
    try {
      const input = path.join(dir, 'rt.txt');
      const archive = path.join(dir, 'rt.7z');
      const outDir = path.join(dir, 'out');
      const content = '7zip-bin host roundtrip sample\n中文第二行\n';
      native.writeFileSync(input, content, 'utf8');
      native.mkdirSync(outDir);
      const add = run7za(c.pkg7za, ['a', archive, input]);
      c.equal(add.ok, true);
      const ext = run7za(c.pkg7za, ['e', archive, '-o' + outDir]);
      c.equal(ext.ok, true);
      const extracted = path.join(outDir, path.basename(input));
      c.equal(native.existsSync(extracted) && native.readFileSync(extracted).equals(native.readFileSync(input)), true);
    } finally { native.rmSync(dir, {recursive: true, force: true}); }
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let pkg; let pkg7za; let loadError;
  try {
    pkg = path.dirname(require.resolve(config.packageName));
    pkg7za = require(config.packageName).path7za;
  } catch (e) { loadError = e; }
  const root = path.join(outputDir, '7zip-bin-' + process.pid + '-' + runId); native.mkdirSync(root, { recursive: true });
  for (const [name, body] of definitions) {
    const start = Date.now(); let expected = null, actual = null, status = 'passed', error = null, skipReason = null; let assertions = 0;
    const context = {
      pkg, pkg7za, config, root, p: s => path.join(root, s),
      equal: (a, b) => { expected = b; actual = a; assertions++; assert.deepStrictEqual(a, b); },
      record: (e, a) => { expected = e; actual = a; assertions++; },
      skip: (reason) => { skipReason = reason; },
    };
    try { if (loadError) throw loadError; await body(context); if (skipReason) { status = 'not-run'; } else { assert(assertions > 0, 'case did not record an assertion'); } } catch (e) { status = 'failed'; error = { name: e.name, code: e.code, message: e.message, stack: e.stack }; }
    const result = { name, status, expected, actual, durationMs: Date.now() - start, error, skipReason }; results.push(result);
    console.log('7ZIPBIN_CASE ' + JSON.stringify({ runId, pid: process.pid, ...result }));
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
  console.log('7ZIPBIN_DONE ' + JSON.stringify({ runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total }));
  return report;
}
module.exports = { run, definitions };
