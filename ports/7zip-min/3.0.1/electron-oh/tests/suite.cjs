'use strict';
/* Host-safe regression suite for @ohos-ports-electron/7zip-min (CI compatibility job).
 * Runs on plain Node (Linux/Windows CI) against the installed candidate tgz.
 * Cases mirror the device roster's host-safe subset: package identity, unchanged
 * distributed source hashes, path7za resolution, and real 7za archive operations
 * (pack/unpack/list roundtrip, custom binary path config) against the shipped
 * 7za binary on the current host platform. No device or OHOS-specific behavior
 * is claimed. */
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const os = require('os');

function run7za(bin, args, opts) {
  const { spawnSync } = require('node:child_process');
  const r = spawnSync(bin, args, Object.assign({ encoding: 'utf8', timeout: 60000 }, opts || {}));
  if (r.error) return { ok: false, out: 'spawn-error:' + String(r.error.message).slice(0, 200) };
  return { ok: r.status === 0, out: String(r.stdout || '') + String(r.stderr || '') };
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
    c.equal(native.existsSync(p7z), true);
    c.equal(path.basename(p7z).includes('7za'), true);
  }],
  ['library default binary path matches shipped 7za', async c => {
    const lib = require(c.config.packageName);
    c.equal(typeof lib.getConfig === 'function' && typeof lib.config === 'function', true);
    c.equal(lib.getConfig().binaryPath, c.pkg7za);
  }],
  ['7za runs and prints 7-Zip banner', async c => {
    const r = run7za(c.pkg7za, ['i']);
    c.equal(r.ok, true);
    c.equal(r.out.includes('7-Zip'), true);
  }],
  ['pack then list contains the input name', async c => {
    const dir = native.mkdtempSync(path.join(os.tmpdir(), '7z-min-create-'));
    try {
      const input = path.join(dir, 'input.txt');
      const archive = path.join(dir, 'out.7z');
      native.writeFileSync(input, '7zip-min host create sample\n', 'utf8');
      const add = run7za(c.pkg7za, ['a', archive, input]);
      c.equal(add.ok, true);
      c.equal(native.existsSync(archive) && native.statSync(archive).size > 0, true);
      const list = run7za(c.pkg7za, ['l', archive]);
      c.equal(list.ok && list.out.includes('input.txt'), true);
    } finally { native.rmSync(dir, { recursive: true, force: true }); }
  }],
  ['extract roundtrip is byte-equal', async c => {
    const dir = native.mkdtempSync(path.join(os.tmpdir(), '7z-min-round-'));
    try {
      const input = path.join(dir, 'rt.txt');
      const archive = path.join(dir, 'rt.7z');
      const outDir = path.join(dir, 'out');
      const content = '7zip-min host roundtrip sample\n中文第二行\n';
      native.writeFileSync(input, content, 'utf8');
      native.mkdirSync(outDir);
      const add = run7za(c.pkg7za, ['a', archive, input]);
      c.equal(add.ok, true);
      const ext = run7za(c.pkg7za, ['e', archive, '-o' + outDir]);
      c.equal(ext.ok, true);
      const extracted = path.join(outDir, path.basename(input));
      c.equal(native.existsSync(extracted) && native.readFileSync(extracted).equals(native.readFileSync(input)), true);
    } finally { native.rmSync(dir, { recursive: true, force: true }); }
  }],
  ['library pack/unpack API roundtrip via the shipped binary', async c => {
    const dir = native.mkdtempSync(path.join(os.tmpdir(), '7z-min-api-'));
    try {
      const lib = require(c.config.packageName);
      const input = path.join(dir, 'api.txt');
      const archive = path.join(dir, 'api.7z');
      const outDir = path.join(dir, 'out');
      const content = '7zip-min api roundtrip sample\n';
      native.writeFileSync(input, content, 'utf8');
      native.mkdirSync(outDir);
      await lib.pack(input, archive);
      c.equal(native.existsSync(archive) && native.statSync(archive).size > 0, true);
      await lib.unpack(archive, outDir);
      const extracted = path.join(outDir, path.basename(input));
      c.equal(native.existsSync(extracted) && native.readFileSync(extracted).toString('utf8') === content, true);
      const items = await lib.list(archive);
      c.equal(Array.isArray(items) && items.some(i => i.name === path.basename(input)), true);
    } finally { native.rmSync(dir, { recursive: true, force: true }); }
  }],
  ['custom binary path config is honored', async c => {
    const dir = native.mkdtempSync(path.join(os.tmpdir(), '7z-min-cfg-'));
    try {
      const lib = require(c.config.packageName);
      const old = lib.getConfig();
      try {
        lib.config({ binaryPath: c.pkg7za });
        const updated = lib.getConfig();
        c.equal(updated.binaryPath, c.pkg7za);
        const input = path.join(dir, 'cfg.txt');
        const archive = path.join(dir, 'cfg.7z');
        native.writeFileSync(input, 'config binary path sample\n', 'utf8');
        await lib.pack(input, archive);
        c.equal(native.existsSync(archive) && native.statSync(archive).size > 0, true);
      } finally { lib.config(old); }
    } finally { native.rmSync(dir, { recursive: true, force: true }); }
  }],
  ['error contract exposes code and stderr', async c => {
    const dir = native.mkdtempSync(path.join(os.tmpdir(), '7z-min-err-'));
    try {
      const lib = require(c.config.packageName);
      let err = null;
      try { await lib.pack(path.join(dir, 'missing'), path.join(dir, 'no.7z')); } catch (e) { err = e; }
      c.equal(!!err && typeof err.code === 'number' && err.code !== 0, true);
      c.equal(!!err && typeof err.stdout === 'string', true);
      c.equal(!!err && typeof err.stderr === 'string' && err.stderr.length > 0, true);
    } finally { native.rmSync(dir, { recursive: true, force: true }); }
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let pkg; let pkg7za; let loadError;
  try {
    // main = ./src/index.js -> two dirname() steps to reach the package root
    pkg = path.dirname(path.dirname(require.resolve(config.packageName)));
    pkg7za = require(config.packageName).getConfig().binaryPath;
  } catch (e) { loadError = e; }
  const root = path.join(outputDir, '7zip-min-' + process.pid + '-' + runId); native.mkdirSync(root, { recursive: true });
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
    console.log('7ZIPMIN_CASE ' + JSON.stringify({ runId, pid: process.pid, ...result }));
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
  console.log('7ZIPMIN_DONE ' + JSON.stringify({ runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total }));
  return report;
}
module.exports = { run, definitions };
