'use strict';
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const TEST_CODE = "console.log('      Greetings from Bytenode!');43;";
const TEST_FILE_CODE = "console.log('      Greetings from a Bytenode file!');\nmodule.exports = 42;";

function mktmp(root) { return native.mkdtempSync(path.join(root, 'bt-host-')); }
function write(dir, name, content) { const p = path.join(dir, name); native.writeFileSync(p, content); return p; }
function isFileNonEmpty(p) { try { return native.statSync(p).isFile() && native.statSync(p).size > 0; } catch (_) { return false; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* in-process CLI driver: argv/exitCode/stdin taken over by the case (host has no spawnable app-domain node) */
async function runCliInProcess(bytenode, args, { input, done } = {}) {
  const cliPath = require.resolve(path.join(bytenode.pkg, 'lib/cli.js'));
  const savedArgv = process.argv;
  const savedExit = process.exitCode;
  const savedStdin = process.stdin;
  let fake = null;
  if (input !== undefined) {
    const { PassThrough } = require('node:stream');
    fake = new PassThrough();
    Object.defineProperty(process, 'stdin', { value: fake, configurable: true, writable: true });
  }
  process.argv = [process.execPath, cliPath, ...args];
  delete require.cache[cliPath];
  require(cliPath);
  if (fake) fake.end(input);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    await sleep(30);
    if (process.exitCode !== undefined && process.exitCode !== savedExit) break;
    if (done && done()) break;
  }
  const rc = process.exitCode ?? 0;
  process.argv = savedArgv;
  process.exitCode = savedExit;
  if (fake) Object.defineProperty(process, 'stdin', { value: savedStdin, configurable: true, writable: true });
  return rc;
}

const definitions = [
  ['package identity', async c => c.equal(JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).name, c.config.packageName)],
  ['unchanged distributed JavaScript', async c => {
    const hashes = {}; for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel); hashes[rel] = actual;
    } c.equal(Object.keys(hashes).length, Object.keys(c.config.libraryFiles).length);
  }],
  ['compileCode() compiles without error', async c => { const buf = c.bytenode.compileCode(TEST_CODE); c.equal(buf instanceof Buffer, true); }],
  ['compileCode() returns non-zero-length buffer', async c => { const buf = c.bytenode.compileCode(TEST_CODE); c.equal(buf.length !== 0, true); }],
  ['compileCode(), with compress = true compiles without error', async c => { const buf = c.bytenode.compileCode(TEST_CODE, true); c.equal(buf instanceof Buffer, true); }],
  ['compileCode(), with compress = true returns non-zero-length buffer', async c => { const buf = c.bytenode.compileCode(TEST_CODE, true); c.equal(buf.length !== 0, true); }],
  ['runBytecode() runs without error', async c => { const bytecode = c.bytenode.compileCode(TEST_CODE); const result = c.bytenode.runBytecode(bytecode); c.equal(result, 43); }],
  ['compileFile() creates non-zero length binary and loader files', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'testfile.js', TEST_FILE_CODE);
    const out = path.join(dir, 'testfile.jsc'); const loader = path.join(dir, 'testfile.js');
    await c.bytenode.compileFile({ filename: src, output: out, loaderFilename: '%.js' });
    c.equal([isFileNonEmpty(out), isFileNonEmpty(loader)], [true, true]);
  }],
  ['compileFile() compiles with compress = true', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'testfile.js', TEST_FILE_CODE);
    const out = path.join(dir, 'testfile.jsc'); const loader = path.join(dir, 'testfile.js');
    await c.bytenode.compileFile({ filename: src, output: out, compress: true });
    c.equal([isFileNonEmpty(out), isFileNonEmpty(loader)], [true, true]);
  }],
  ['compileFile() runs the .jsc file via require()', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'testfile.js', TEST_FILE_CODE);
    const out = path.join(dir, 'testfile.jsc');
    await c.bytenode.compileFile({ filename: src, output: out });
    c.equal(require(out), 42);
  }],
  ['compileFile() with electronRenderer = true rejects electronMain combined with electronRenderer', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'testfile.js', TEST_FILE_CODE);
    const out = path.join(dir, 'testfile.jsc');
    let err = null;
    try { await c.bytenode.compileFile({ filename: src, output: out, electronMain: true, electronRenderer: true }); } catch (e) { err = e; }
    c.equal([!!err, /mutually exclusive/.test(String((err && err.message) || err))], [true, true]);
  }],
  ['CLI --compile exit status exits with status 1 when the source has a syntax error', async c => {
    const dir = mktmp(c.root); const bad = write(dir, 'syntax-error.js', '});\n');
    const rc = await runCliInProcess(c, ['-c', bad]); c.equal(rc, 1);
  }],
  ['CLI --compile exit status exits with status 1 when the input file does not exist', async c => {
    const dir = mktmp(c.root); const rc = await runCliInProcess(c, ['-c', path.join(dir, 'no-such-file.js')]); c.equal(rc, 1);
  }],
  ['CLI --compile exit status exits with status 1 when stdin source has a syntax error', async c => {
    const rc = await runCliInProcess(c, ['--compile', '--no-module', '-'], { input: '});\n' }); c.equal(rc, 1);
  }],
  ['CLI --compile exit status exits with status 0 when compilation succeeds', async c => {
    const dir = mktmp(c.root); const ok = write(dir, 'ok.js', 'module.exports = 1;\n');
    const jsc = path.join(dir, 'ok.jsc');
    const rc = await runCliInProcess(c, ['-c', ok], { done: () => isFileNonEmpty(jsc) });
    c.equal([rc, isFileNonEmpty(jsc)], [0, true]);
  }],
  ['F-01-04-compile-no-module', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'src.js', 'const answer = 21 * 2; answer;');
    const outNoModule = path.join(dir, 'bare.jsc'); const outModule = path.join(dir, 'wrapped.jsc');
    await c.bytenode.compileFile({ filename: src, output: outNoModule, compileAsModule: false });
    c.equal(isFileNonEmpty(outNoModule), true);
    const result = c.bytenode.runBytecode(native.readFileSync(outNoModule));
    c.equal(result, 42);
    await c.bytenode.compileFile({ filename: src, output: outModule });
    const wrapped = c.bytenode.runBytecode(native.readFileSync(outModule));
    c.equal(typeof wrapped, 'function');
  }],
  ['F-02-02-run-bytecode-file', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'src.js', 'const v = 6 * 7; v;');
    const jsc = path.join(dir, 'out.jsc');
    await c.bytenode.compileFile({ filename: src, output: jsc, compileAsModule: false });
    c.equal(isFileNonEmpty(jsc), true);
    c.equal(c.bytenode.runBytecodeFile(jsc), 42);
    let threw = false;
    try { c.bytenode.runBytecodeFile(path.join(dir, 'no-such-file.jsc')); } catch (e) { threw = e instanceof Error; }
    c.equal(threw, true);
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let bytenode, pkg; let loadError;
  try { bytenode = require(config.packageName); pkg = path.dirname(path.dirname(require.resolve(config.packageName))); } catch (e) { loadError = e; }
  const root = path.join(outputDir, 'bytenode-' + process.pid + '-' + runId); native.mkdirSync(root, { recursive: true });
  for (const [name, body] of definitions) {
    const start = Date.now(); let expected = null, actual = null, status = 'passed', error = null; let assertions = 0;
    const context = {
      bytenode, pkg, config, root, p: s => path.join(root, s),
      equal: (a, b) => { expected = b; actual = a; assertions++; assert.deepStrictEqual(a, b); },
      record: (e, a) => { expected = e; actual = a; assertions++; },
    };
    try { if (loadError) throw loadError; await body(context); assert(assertions > 0, 'case did not record an assertion'); } catch (e) { status = 'failed'; error = { name: e.name, code: e.code, message: e.message, stack: e.stack }; }
    const result = { name, status, expected, actual, durationMs: Date.now() - start, error }; results.push(result);
    console.log('BYTENODE_CASE ' + JSON.stringify({ runId, pid: process.pid, ...result }));
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
  console.log('BYTENODE_DONE ' + JSON.stringify({ runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total }));
  return report;
}
module.exports = { run, definitions };
