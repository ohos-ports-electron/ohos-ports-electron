'use strict';
/* Host-safe regression suite for @ohos-ports-electron/compressing (CI compatibility job).
 * Runs on plain Node (Linux CI + Windows) against the installed candidate tgz.
 * Cases mirror the device roster's host-safe subset: real API round-trips
 * (gzip/tar/tgz/zip), stream forms, error contracts, path-traversal normalization
 * and package identity. No device, fixture archive or OHOS-specific behavior is claimed. */
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const HELLO = 'hello compressing';
const TREE_ONE = 'ONE';
const TREE_TWO = 'TWO';

function mktmp(root) { return native.mkdtempSync(path.join(root, 'comp-host-')); }
function write(dir, name, content) { const p = path.join(dir, name); native.writeFileSync(p, content); return p; }
function read(p) { return native.readFileSync(p, 'utf8'); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function makeTree(dir) {
  native.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  write(dir, 'one.txt', TREE_ONE);
  write(path.join(dir, 'sub'), 'two.txt', TREE_TWO);
  return dir;
}

const definitions = [
  ['package identity', async c => c.equal(JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).name, c.config.packageName)],
  ['unchanged distributed JavaScript', async c => {
    const hashes = {}; for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel); hashes[rel] = actual;
    } c.equal(Object.keys(hashes).length, Object.keys(c.config.libraryFiles).length);
  }],
  ['gzip.compressFile(sourceFile, destFile) round-trips through gzip.decompress()', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'a.txt', HELLO); const gz = path.join(dir, 'a.txt.gz'); const back = path.join(dir, 'a.back');
    await c.compressing.gzip.compressFile(src, gz);
    await c.compressing.gzip.decompress(gz, back);
    c.equal(read(back), HELLO);
  }],
  ['gzip.compressFile(sourceBuffer, destFile) accepts a buffer source', async c => {
    const dir = mktmp(c.root); const gz = path.join(dir, 'b.txt.gz'); const back = path.join(dir, 'b.back');
    await c.compressing.gzip.compressFile(Buffer.from(HELLO + ' buffer'), gz);
    await c.compressing.gzip.decompress(gz, back);
    c.equal(read(back), HELLO + ' buffer');
  }],
  ['gzip.uncompress(sourceFile, destFile) restores the original file', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'a.txt', HELLO); const gz = path.join(dir, 'a.txt.gz'); const back = path.join(dir, 'a2.back');
    await c.compressing.gzip.compressFile(src, gz);
    await c.compressing.gzip.uncompress(gz, back);
    c.equal(read(back), HELLO);
  }],
  ['tar.compressDir(dir, destFile) round-trips a nested tree via tar.uncompress()', async c => {
    const dir = mktmp(c.root); const tree = makeTree(path.join(dir, 'tree'));
    const tarF = path.join(dir, 'tree.tar'); const out = path.join(dir, 'out');
    await c.compressing.tar.compressDir(tree, tarF);
    await c.compressing.tar.uncompress(tarF, out);
    c.equal([read(path.join(out, 'tree', 'one.txt')), read(path.join(out, 'tree', 'sub', 'two.txt'))], [TREE_ONE, TREE_TWO]);
  }],
  ['tar.compressFile(file, destFile) round-trips a single file', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'solo.txt', HELLO); const tarF = path.join(dir, 'solo.tar'); const out = path.join(dir, 'out');
    await c.compressing.tar.compressFile(src, tarF);
    await c.compressing.tar.uncompress(tarF, out);
    c.equal(read(path.join(out, 'solo.txt')), HELLO);
  }],
  ['tar.Stream addEntry(file) and addEntry(buffer, { relativePath }) read back exactly', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'a.txt', HELLO);
    const stream = new c.compressing.tar.Stream();
    stream.addEntry(src);
    stream.addEntry(Buffer.from('BUFCONTENT'), { relativePath: 'buf.txt' });
    const tarF = path.join(dir, 'two.tar'); const ws = native.createWriteStream(tarF);
    stream.pipe(ws);
    await new Promise((r) => ws.on('close', r));
    const out = path.join(dir, 'out');
    await c.compressing.tar.uncompress(tarF, out);
    c.equal([read(path.join(out, 'a.txt')), read(path.join(out, 'buf.txt'))], [HELLO, 'BUFCONTENT']);
  }],
  ['tar.compressDir(dir, destStream) accepts a writable stream destination', async c => {
    const dir = mktmp(c.root); const tree = makeTree(path.join(dir, 'tree'));
    const tarF = path.join(dir, 's.tar'); const destStream = native.createWriteStream(tarF);
    await c.compressing.tar.compressDir(tree, destStream);
    const out = path.join(dir, 'out');
    await c.compressing.tar.uncompress(tarF, out);
    c.equal(read(path.join(out, 'tree', 'one.txt')), TREE_ONE);
  }],
  ['tgz.compressDir(dir, destFile) round-trips a nested tree via tgz.uncompress()', async c => {
    const dir = mktmp(c.root); const tree = makeTree(path.join(dir, 'tree'));
    const tgzF = path.join(dir, 'tree.tgz'); const out = path.join(dir, 'out');
    await c.compressing.tgz.compressDir(tree, tgzF);
    await c.compressing.tgz.uncompress(tgzF, out);
    c.equal([read(path.join(out, 'tree', 'one.txt')), read(path.join(out, 'tree', 'sub', 'two.txt'))], [TREE_ONE, TREE_TWO]);
  }],
  ['tgz.decompress(sourceFile, destDir) extracts the archive tree', async c => {
    const dir = mktmp(c.root); const tree = makeTree(path.join(dir, 'tree'));
    const tgzF = path.join(dir, 'tree.tgz'); const out = path.join(dir, 'out');
    await c.compressing.tgz.compressDir(tree, tgzF);
    await c.compressing.tgz.decompress(tgzF, out);
    c.equal(read(path.join(out, 'tree', 'sub', 'two.txt')), TREE_TWO);
  }],
  ['zip.compressFile(file, destFile) round-trips via zip.uncompress()', async c => {
    const dir = mktmp(c.root); const src = write(dir, 'z.txt', HELLO); const zipF = path.join(dir, 'z.zip'); const out = path.join(dir, 'out');
    await c.compressing.zip.compressFile(src, zipF);
    await c.compressing.zip.uncompress(zipF, out);
    c.equal(read(path.join(out, 'z.txt')), HELLO);
  }],
  ['zip.compressDir(dir, destFile) round-trips a nested tree via zip.uncompress()', async c => {
    const dir = mktmp(c.root); const tree = makeTree(path.join(dir, 'tree'));
    const zipF = path.join(dir, 'tree.zip'); const out = path.join(dir, 'out');
    await c.compressing.zip.compressDir(tree, zipF);
    await c.compressing.zip.uncompress(zipF, out);
    c.equal([read(path.join(out, 'tree', 'one.txt')), read(path.join(out, 'tree', 'sub', 'two.txt'))], [TREE_ONE, TREE_TWO]);
  }],
  ['zip.compressDir(dir, destStream) accepts a writable stream destination', async c => {
    const dir = mktmp(c.root); const tree = makeTree(path.join(dir, 'tree'));
    const zipF = path.join(dir, 's.zip'); const destStream = native.createWriteStream(zipF);
    await c.compressing.zip.compressDir(tree, destStream);
    const out = path.join(dir, 'out');
    await c.compressing.zip.uncompress(zipF, out);
    c.equal(read(path.join(out, 'tree', 'one.txt')), TREE_ONE);
  }],
  ['zip.FileStream(buffer without relativePath) throws the documented precondition', async c => {
    let threw = false; let message = '';
    try { new c.compressing.zip.FileStream({ source: Buffer.from('x') }); } catch (e) { threw = true; message = e.message; }
    c.equal([threw, /relativePath is required/.test(message)], [true, true]);
  }],
  ['zip.UncompressStream emits an error for a non-zip payload', async c => {
    const s = new c.compressing.zip.UncompressStream(); let zerr = null;
    s.on('error', (e) => { zerr = e; });
    s.end(Buffer.from('this is definitely not a zip archive'));
    for (let i = 0; i < 50 && !zerr; i++) await wait(20);
    c.equal([!!zerr, /zip/i.test(String(zerr && zerr.message))], [true, true]);
  }],
  ['tar entry named "../../evil.txt" is normalized inside the destination and does not escape', async c => {
    const dir = mktmp(c.root);
    const stream = new c.compressing.tar.Stream();
    stream.addEntry(Buffer.from('EVIL'), { relativePath: '../../evil.txt' });
    const tarF = path.join(dir, 'evil.tar'); const ws = native.createWriteStream(tarF);
    stream.pipe(ws);
    await new Promise((r) => ws.on('close', r));
    const out = path.join(dir, 'out');
    await c.compressing.tar.uncompress(tarF, out);
    c.equal([native.existsSync(path.join(out, 'evil.txt')), native.existsSync(path.join(dir, 'evil.txt'))], [true, false]);
  }],
  ['lib/utils stripFileName/sourceType/destType keep their contracts', async c => {
    const utils = require(path.join(c.pkg, 'lib', 'utils.js'));
    let sourceErr = null; let destErr = null;
    try { utils.sourceType(123); } catch (e) { sourceErr = e; }
    try { utils.destType(123); } catch (e) { destErr = e; }
    c.equal([
      utils.stripFileName(0, '../../evil.txt'),
      utils.stripFileName(1, 'foo/bar.txt'),
      utils.stripFileName(0, './a/b.js'),
      utils.stripFileName(2, 'node/lib/index.js'),
      sourceErr instanceof Error && /Type is not supported/.test(sourceErr.message),
      destErr instanceof Error && /Type is not supported/.test(destErr.message),
    ], ['evil.txt', 'bar.txt', 'a/b.js', 'index.js', true, true]);
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let compressing, pkg; let loadError;
  try {
    compressing = require(config.packageName);
    // resolve the package root by walking up to the package.json that owns this
    // package name (main is index.js, one level below the package root)
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
  const root = path.join(outputDir, 'compressing-' + process.pid + '-' + runId); native.mkdirSync(root, { recursive: true });
  for (const [name, body] of definitions) {
    const start = Date.now(); let expected = null, actual = null, status = 'passed', error = null; let assertions = 0;
    const context = {
      compressing, pkg, config, root, p: s => path.join(root, s),
      equal: (a, b) => { expected = b; actual = a; assertions++; assert.deepStrictEqual(a, b); },
      record: (e, a) => { expected = e; actual = a; assertions++; },
    };
    try { if (loadError) throw loadError; await body(context); assert(assertions > 0, 'case did not record an assertion'); } catch (e) { status = 'failed'; error = { name: e.name, code: e.code, message: e.message, stack: e.stack }; }
    const result = { name, status, expected, actual, durationMs: Date.now() - start, error }; results.push(result);
    console.log('COMPRESSING_CASE ' + JSON.stringify({ runId, pid: process.pid, ...result }));
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
  console.log('COMPRESSING_DONE ' + JSON.stringify({ runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total }));
  return report;
}
module.exports = { run, definitions };
