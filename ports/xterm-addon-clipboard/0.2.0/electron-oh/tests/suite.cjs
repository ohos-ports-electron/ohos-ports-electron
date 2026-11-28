'use strict';
/* Host-safe regression suite for @ohos-ports-electron/xterm-addon-clipboard (CI compatibility job).
 * Runs on plain Node (Linux CI) against the installed candidate tgz + @xterm/headless.
 * The upstream CJS entry (lib/addon-clipboard.js) is a webpack UMD build targeting the
 * browser global (`self`) and does not load in plain Node; the verified entry is the ESM
 * build (lib/addon-clipboard.mjs), which is what this suite imports (same approach as the
 * device roster). Cases mirror the device roster's host-safe subset: package identity,
 * unchanged distributed file hashes, js-base64 runtime dependency closure, Base64 contracts
 * and ClipboardAddon OSC 52 copy/query/report against an injected in-memory IClipboardProvider
 * on a real @xterm/headless Terminal. No device or OHOS-specific behavior is claimed. */
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const definitions = [
  ['package identity', async c => c.equal(JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).name, c.config.packageName)],
  ['unchanged distributed files', async c => {
    const hashes = {}; for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel); hashes[rel] = actual;
    } c.equal(Object.keys(hashes).length, Object.keys(c.config.libraryFiles).length);
  }],
  ['runtime dependency closure: js-base64 satisfies the locked range', async c => {
    const meta = JSON.parse(native.readFileSync(require.resolve('js-base64/package.json'), 'utf8'));
    c.equal(c.meta.dependencies['js-base64'], '^3.7.5');
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(meta.version);
    c.equal(m !== null && Number(m[1]) === 3, true);
    c.equal(m !== null && (Number(m[2]) > 7 || (Number(m[2]) === 7 && Number(m[3]) >= 5)), true);
  }],
  ['ESM entry loads and exposes the 0.2.0 public exports', async c => {
    c.equal(typeof c.lib.ClipboardAddon, 'function');
    c.equal(typeof c.lib.Base64, 'function');
    c.equal(typeof c.lib.BrowserClipboardProvider, 'function');
    c.equal(JSON.stringify(Object.keys(c.lib).sort()), JSON.stringify(['Base64', 'BrowserClipboardProvider', 'ClipboardAddon']));
  }],
  ['Base64 encode/decode round-trip and known vectors', async c => {
    c.equal(c.base64.encodeText('hello'), 'aGVsbG8=');
    c.equal(c.base64.decodeText('aGVsbG8='), 'hello');
    c.equal(c.base64.decodeText(c.base64.encodeText('clipboard-测试-😀')), 'clipboard-测试-😀');
  }],
  ['ClipboardAddon OSC 52 copy writes decoded text through the injected provider', async c => {
    const writes = [];
    const provider = { readText: async () => '', writeText: async (sel, text) => writes.push([sel, text]) };
    const term = new c.Terminal({ allowProposedApi: true });
    const addon = new c.ClipboardAddon(new c.Base64(), provider);
    term.loadAddon(addon);
    await new Promise(resolve => term.write('\x1b]52;c;aGVsbG8=\x07', resolve));
    c.equal(JSON.stringify(writes), JSON.stringify([['c', 'hello']]));
  }],
  ['ClipboardAddon OSC 52 query reports the clipboard text back into the terminal', async c => {
    const provider = { readText: async () => 'hello', writeText: async () => {} };
    const term = new c.Terminal({ allowProposedApi: true });
    let reported = '';
    term.onData(d => { reported += d; });
    const addon = new c.ClipboardAddon(new c.Base64(), provider);
    term.loadAddon(addon);
    await new Promise(resolve => term.write('\x1b]52;c;?\x07', resolve));
    c.equal(reported, '\x1b]52;c;aGVsbG8=\x07');
  }],
  ['PRIMARY (p) and SYSTEM (c) selections route through the provider', async c => {
    const writes = [];
    const provider = { readText: async () => '', writeText: async (sel, text) => writes.push([sel, text]) };
    const term = new c.Terminal({ allowProposedApi: true });
    term.loadAddon(new c.ClipboardAddon(new c.Base64(), provider));
    await new Promise(resolve => term.write('\x1b]52;p;aGVsbG8=\x07', resolve));
    await new Promise(resolve => term.write('\x1b]52;c;aGVsbG8=\x07', resolve));
    c.equal(JSON.stringify(writes), JSON.stringify([['p', 'hello'], ['c', 'hello']]));
  }],
  ['dispose() unregisters the OSC 52 handler', async c => {
    const writes = [];
    const provider = { readText: async () => '', writeText: async (sel, text) => writes.push([sel, text]) };
    const term = new c.Terminal({ allowProposedApi: true });
    const addon = new c.ClipboardAddon(new c.Base64(), provider);
    term.loadAddon(addon);
    addon.dispose();
    await new Promise(resolve => term.write('\x1b]52;c;aGVsbG8=\x07', resolve));
    c.equal(writes.length, 0);
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let lib; let pkg; let meta; let Terminal; let loadError;
  try {
    pkg = path.dirname(require.resolve(config.packageName + '/package.json'));
    meta = JSON.parse(native.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
    assert.strictEqual(meta.name, config.packageName);
    const mod = await import(config.packageName + '/lib/addon-clipboard.mjs');
    lib = mod;
    const { Terminal: HeadlessTerminal } = require('@xterm/headless');
    Terminal = HeadlessTerminal;
  } catch (e) { loadError = e; }
  const root = path.join(outputDir, 'xterm-clipboard-' + process.pid + '-' + runId); native.mkdirSync(root, { recursive: true });
  const c = { ...(lib || {}), lib, Terminal, base64: lib && lib.Base64 ? new lib.Base64() : null, pkg, meta, config, root };
  for (const [name, body] of definitions) {
    const start = Date.now(); let expected = null, actual = null, status = 'passed', error = null, skipReason = null; let assertions = 0;
    const ctx = {
      ...c,
      p: s => path.join(root, s),
      equal: (a, b) => { expected = b; actual = a; assertions++; assert.deepStrictEqual(a, b); },
      skip: (reason) => { skipReason = reason; },
    };
    try { if (loadError) throw loadError; await body(ctx); if (skipReason) { status = 'not-run'; } else { assert(assertions > 0, 'case did not record an assertion'); } } catch (e) { status = 'failed'; error = { name: e.name, code: e.code, message: e.message, stack: e.stack }; }
    const result = { name, status, expected, actual, durationMs: Date.now() - start, error, skipReason }; results.push(result);
    console.log('XTERM_CLIPBOARD_CASE ' + JSON.stringify({ runId, pid: process.pid, ...result }));
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
  console.log('XTERM_CLIPBOARD_DONE ' + JSON.stringify({ runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total }));
  return report;
}
module.exports = { run, definitions };
