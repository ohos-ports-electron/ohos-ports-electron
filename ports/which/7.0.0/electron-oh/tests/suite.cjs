'use strict';
/* Host-safe regression suite for @ohos-ports-electron/which (CI compatibility job).
 * Runs on plain Node (Linux CI + Windows) against the installed candidate tgz.
 * Cases mirror the device roster's host-safe subset: the 22 index.js cases
 * (posix/win32 variants of the upstream assertions), five bin.js CLI cases that
 * do not depend on device-only PATH fixtures (finds node, flergyderp miss, usage,
 * unknown flag, dash-dash passthrough), plus package identity and unchanged-lib
 * hashes. The six CLI cases needing tap/which PATH stubs run only on the device
 * Node target and are not claimed here. No device or OHOS-specific behavior is
 * claimed. */
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function write(dir, name, content, mode) {
  const p = path.join(dir, name);
  native.mkdirSync(dir, { recursive: true });
  native.writeFileSync(p, content);
  if (mode) native.chmodSync(p, mode);
  return p;
}
function isArraySame(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}
// upstream test/index.js:85 — on a real win32 host the .sh fixtures need an
// explicit pathExt option; posix hosts (Linux CI) use plain mode-bit checks
const FOUND_OPTS = process.platform === 'win32' ? { pathExt: '.sh' } : {};

const NODE_RE = /[\\/]node(\.exe)?$/i;

const definitions = [
  ['package identity', async c => c.equal(JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).name, c.config.packageName)],
  ['unchanged distributed JavaScript', async c => {
    const hashes = {}; for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel); hashes[rel] = actual;
    } c.equal(Object.keys(hashes).length, Object.keys(c.config.libraryFiles).length);
  }],

  ['does not find missed - throw - posix', async c => { const r = await c.missedThrow(); c.equal(r, 'ENOENT'); }],
  ['does not find missed - throw - win32', async c => { const r = await c.missedThrow(); c.equal(r, 'ENOENT'); }],
  ['does not find missed - nothrow - posix', async c => { const r = await c.missedNothrow(); c.equal(r, null); }],
  ['does not find missed - nothrow - win32', async c => { const r = await c.missedNothrow(); c.equal(r, null); }],
  ['does not find non-executable - absolute - posix', async c => { const r = await c.nonExecutableAbsolute(); c.equal(r, 'ENOENT'); }],
  ['does not find non-executable - absolute - win32', async c => { const r = await c.nonExecutableAbsolute(); c.equal(r, 'ENOENT'); }],
  ['does not find non-executable - with path - posix', async c => { const r = await c.nonExecutableWithPath(); c.equal(r, 'ENOENT'); }],
  ['does not find non-executable - with path - win32', async c => { const r = await c.nonExecutableWithPath(); c.equal(r, 'ENOENT'); }],
  ['find when executable - absolute - posix', async c => { const r = await c.foundAbsolute(); c.equal(r, c.lastFoo); }],
  ['find when executable - absolute - win32', async c => { const r = await c.foundAbsolute(); c.equal(r, c.lastFoo); }],
  ['find when executable - with process.env.PATH - posix', async c => { const r = await c.foundWithEnvPath(); c.equal(r, c.lastFoo); }],
  ['find when executable - with process.env.PATH - win32', async c => { const r = await c.foundWithEnvPath(); c.equal(r, c.lastFoo); }],
  ['find when executable - with path opt - posix', async c => { const r = await c.foundWithPathOpt(); c.equal(r, c.lastFoo); }],
  ['find when executable - with path opt - win32', async c => { const r = await c.foundWithPathOpt(); c.equal(r, c.lastFoo); }],
  ['find when executable - no ./ - posix', async c => { const r = await c.foundNoDotSlash(); c.equal(r, c.lastRel); }],
  ['find when executable - no ./ - win32', async c => { const r = await c.foundNoDotSlash(); c.equal(r, c.lastRel); }],
  ['find when executable - with ./ - posix', async c => { const r = await c.foundWithDotSlash(); c.equal(r, c.lastRel); }],
  ['find when executable - with ./ - win32', async c => { const r = await c.foundWithDotSlash(); c.equal(r, c.lastRel); }],
  ['find when executable - with ../ - posix', async c => { const r = await c.foundWithDotDot(); c.equal(r, c.lastRel); }],
  ['find when executable - with ../ - win32', async c => { const r = await c.foundWithDotDot(); c.equal(r, c.lastRel); }],
  ['find all - posix', async c => { const r = await c.findAll(); c.equal(isArraySame(r, c.lastCmds), true); }],
  ['find all - win32', async c => { const r = await c.findAll(); c.equal(isArraySame(r, c.lastCmds), true); }],

  ['cli finds node', async c => {
    const r = c.runCli(['node']);
    assert.strictEqual(r.signal, null); assert.strictEqual(r.code, 0); assert.strictEqual(r.err, '');
    c.equal(NODE_RE.test(r.out), true);
  }],
  ['cli does not find flergyderp', async c => {
    const r = c.runCli(['flergyderp']);
    assert.strictEqual(r.signal, null); assert.strictEqual(r.code, 1); assert.strictEqual(r.err, '');
    c.equal(r.out, '');
  }],
  ['cli shows usage', async c => {
    const r = c.runCli([]);
    assert.strictEqual(r.signal, null); assert.strictEqual(r.code, 1); assert.strictEqual(r.out, '');
    c.equal(r.err, 'usage: which [-as] program ...');
  }],
  ['cli complains about unknown flag', async c => {
    const r = c.runCli(['node', '-sax']);
    assert.strictEqual(r.signal, null); assert.strictEqual(r.code, 1); assert.strictEqual(r.out, '');
    c.equal(r.err, 'which: illegal option -- x\nusage: which [-as] program ...');
  }],
  ['cli anything after -- is ignored', async c => {
    const r = c.runCli(['node', '--', '--anything-goes-here']);
    assert.strictEqual(r.signal, null); assert.strictEqual(r.code, 0); assert.strictEqual(r.err, '');
    c.equal(NODE_RE.test(r.out), true);
  }],
];

const bodies = {
  async missedThrow() {
    const dir = this.mkdir('nf-throw');
    const cmd = path.join(dir, 'foobar.sh');
    let aCode = null; try { await this.which(cmd); } catch (e) { aCode = e.code; }
    assert.strictEqual(aCode, 'ENOENT');
    let sCode = null; try { this.which.sync(cmd); } catch (e) { sCode = e.code; }
    return sCode;
  },
  async missedNothrow() {
    const dir = this.mkdir('nf-nothrow');
    const cmd = path.join(dir, 'foobar.sh');
    const a = await this.which(cmd, { nothrow: true });
    assert.strictEqual(a, null);
    return this.which.sync(cmd, { nothrow: true });
  },
  async nonExecutableAbsolute() {
    const dir = this.mkdir('non-exec-abs');
    const foo = write(dir, 'foo.sh', 'echo foo\n');
    let aCode = null; try { await this.which(foo); } catch (e) { aCode = e.code; }
    assert.strictEqual(aCode, 'ENOENT');
    let sCode = null; try { this.which.sync(foo); } catch (e) { sCode = e.code; }
    return sCode;
  },
  async nonExecutableWithPath() {
    const dir = this.mkdir('non-exec-path');
    const foo = write(dir, 'foo.sh', 'echo foo\n');
    let aCode = null; try { await this.which(path.basename(foo), { path: dir }); } catch (e) { aCode = e.code; }
    assert.strictEqual(aCode, 'ENOENT');
    let sCode = null; try { this.which.sync(path.basename(foo), { path: dir }); } catch (e) { sCode = e.code; }
    return sCode;
  },
  async foundAbsolute() {
    const dir = this.mkdir('found-abs');
    const foo = write(dir, 'foo.sh', 'echo foo\n', 0o755); this.lastFoo = foo;
    const a = await this.which(foo, { ...FOUND_OPTS }); assert.strictEqual(a, foo);
    return this.which.sync(foo, { ...FOUND_OPTS });
  },
  async foundWithEnvPath() {
    const dir = this.mkdir('found-envpath');
    const foo = write(dir, 'foo.sh', 'echo foo\n', 0o755); this.lastFoo = foo;
    process.env.PATH = dir;
    try {
      const a = await this.which(path.basename(foo), { ...FOUND_OPTS }); assert.strictEqual(a, foo);
      return this.which.sync(path.basename(foo), { ...FOUND_OPTS });
    } finally { this.restoreEnv(); }
  },
  async foundWithPathOpt() {
    const dir = this.mkdir('found-pathopt');
    const foo = write(dir, 'foo.sh', 'echo foo\n', 0o755); this.lastFoo = foo;
    const a = await this.which(path.basename(foo), { ...FOUND_OPTS, path: dir }); assert.strictEqual(a, foo);
    return this.which.sync(path.basename(foo), { ...FOUND_OPTS, path: dir });
  },
  async foundNoDotSlash() {
    const dir = this.mkdir('found-nodot');
    const foo = write(dir, 'foo.sh', 'echo foo\n', 0o755);
    const rel = path.relative(process.cwd(), foo); this.lastRel = rel;
    const a = await this.which(rel, { ...FOUND_OPTS }); assert.strictEqual(a, rel);
    return this.which.sync(rel, { ...FOUND_OPTS });
  },
  async foundWithDotSlash() {
    const dir = this.mkdir('found-dot');
    const foo = write(dir, 'foo.sh', 'echo foo\n', 0o755);
    const rel = '.' + path.sep + path.relative(process.cwd(), foo); this.lastRel = rel;
    const a = await this.which(rel, { ...FOUND_OPTS }); assert.strictEqual(a, rel);
    return this.which.sync(rel, { ...FOUND_OPTS });
  },
  async foundWithDotDot() {
    const dir = this.mkdir('found-dotdot');
    const foo = write(dir, 'foo.sh', 'echo foo\n', 0o755);
    const dirName = path.basename(process.cwd());
    const rel = path.join('..', dirName, path.relative(process.cwd(), foo)); this.lastRel = rel;
    const a = await this.which(rel, { ...FOUND_OPTS }); assert.strictEqual(a, rel);
    return this.which.sync(rel, { ...FOUND_OPTS });
  },
  async findAll() {
    const cmdName = 'x.cmd';
    const fixture = this.mkdir('all');
    const dirA = path.join(fixture, 'a'); const dirB = path.join(fixture, 'b');
    const cmdA = write(dirA, cmdName, 'exec me', 0o755); const cmdB = write(dirB, cmdName, 'exec me', 0o755);
    const dirs = [dirA, dirB]; const cmds = [cmdA, cmdB]; this.lastCmds = cmds;
    const opt = { all: true, path: dirs.map((d, index) => index % 2 ? d : `"${d}"`).join(path.delimiter) };
    const a = await this.which(cmdName, opt); assert.ok(isArraySame(a, cmds));
    return this.which.sync(cmdName, opt);
  },
};

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let which, pkg; let loadError;
  try {
    which = require(config.packageName);
    // resolve the package root by walking up to the package.json that owns this
    // package name (main is lib/index.js, one level below the package root)
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
  const root = path.join(outputDir, 'which-' + process.pid + '-' + runId); native.mkdirSync(root, { recursive: true });
  const PATH_SNAPSHOT = process.env.PATH;
  const PATHEXT_SNAPSHOT = process.env.PATHEXT;
  const restoreEnv = () => {
    if (PATH_SNAPSHOT !== undefined) process.env.PATH = PATH_SNAPSHOT; else delete process.env.PATH;
    if (PATHEXT_SNAPSHOT !== undefined) process.env.PATHEXT = PATHEXT_SNAPSHOT; else delete process.env.PATHEXT;
  };
  const BIN = pkg ? path.join(pkg, 'bin', 'which.js') : null;
  const WRAPPER = path.join(root, 'cli-wrap.cjs');
  if (BIN) native.writeFileSync(WRAPPER, 'require(' + JSON.stringify(BIN) + ');\n');

  for (const [name, body] of definitions) {
    const start = Date.now(); let expected = null, actual = null, status = 'passed', error = null; let assertions = 0;
    const ctx = {
      which, pkg, config, root,
      mkdir: (rel) => { const d = path.join(root, rel); native.mkdirSync(d, { recursive: true }); return d; },
      restoreEnv,
      equal: (a, b) => { expected = b; actual = a; assertions++; assert.deepStrictEqual(a, b); },
      runCli: (args, extraPath) => {
        const options = { encoding: 'utf8' };
        if (extraPath) options.env = Object.assign({}, process.env, { PATH: (process.env.PATH || '') + path.delimiter + extraPath });
        const child = spawnSync(process.execPath, [WRAPPER].concat(args), options);
        return { code: child.status, signal: child.signal, out: (child.stdout || '').trim(), err: (child.stderr || '').trim() };
      },
      lastFoo: null, lastRel: null, lastCmds: null,
    };
    for (const [k, v] of Object.entries(bodies)) ctx[k] = v.bind(ctx);
    try {
      if (loadError) throw loadError;
      await body(ctx);
      assert(assertions > 0, 'case did not record an assertion');
    } catch (e) { status = 'failed'; error = { name: e.name, code: e.code, message: e.message, stack: e.stack }; }
    const result = { name, status, expected, actual, durationMs: Date.now() - start, error }; results.push(result);
    console.log('WHICH_CASE ' + JSON.stringify({ runId, pid: process.pid, ...result }));
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
  console.log('WHICH_DONE ' + JSON.stringify({ runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total }));
  return report;
}
module.exports = { run, definitions };
