'use strict';
/*
 * Host-safe regression suite for @ohos-ports-electron/get-stream.
 *
 * Replays a representative subset of the upstream get-stream behaviour against
 * the *installed candidate package* (node_modules/@ohos-ports-electron/get-stream)
 * using real API calls only — no device, no mocks. It also binds the run to the
 * frozen package bytes: package identity (name/version) plus every distributed
 * source file hash must match the frozen manifest supplied in config.json.
 *
 * This is host CI evidence for unchanged library behaviour; device verification
 * (189 upstream ava assertions on independent OpenHarmony Node + Electron-OH
 * 34/37/40, two cold starts each) is recorded separately in release-evidence.json.
 *
 * run(config, outBase) -> { status, packageSha256, checks: [...] }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

async function loadPackage(name) {
  // get-stream's exports map only exposes the library entrypoints (not ./package.json),
  // so resolve the entry (exports default -> source/index.js) and derive the package root.
  const entry = require.resolve(name);
  const pkgDir = path.dirname(path.dirname(entry));
  const meta = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const mod = await import(pathToFileURL(path.join(pkgDir, 'source', 'index.js')).href);
  return { meta, pkgDir, mod, entry };
}

async function run(config, outBase) {
  const checks = [];
  const record = (name, fn) => {
    const started = Date.now();
    return Promise.resolve()
      .then(fn)
      .then(() => checks.push({ name, status: 'passed', ms: Date.now() - started }))
      .catch((error) => checks.push({ name, status: 'failed', ms: Date.now() - started, error: String((error && error.stack) || error) }));
  };

  const name = config.packageName;
  const { meta, pkgDir, mod } = await loadPackage(name);
  const getStream = mod.default;
  const { MaxBufferError } = mod;

  await record('package identity (name/version)', () => {
    if (meta.name !== config.packageName) throw new Error('name mismatch: ' + meta.name);
    if (meta.version !== config.packageVersion) throw new Error('version mismatch: ' + meta.version);
    if (meta.type !== 'module') throw new Error('type must stay module');
    if (meta.repository !== 'undefined' && meta.repository && meta.repository.directory !== 'ports/get-stream/9.0.1') {
      throw new Error('repository directory mismatch: ' + JSON.stringify(meta.repository));
    }
  });

  if (config.libraryFiles) {
    await record('unchanged library source hashes', () => {
      for (const [rel, expected] of Object.entries(config.libraryFiles)) {
        const file = path.join(pkgDir, rel);
        if (!fs.existsSync(file)) throw new Error('missing ' + rel);
        const actual = sha(fs.readFileSync(file));
        if (expected && actual !== expected) throw new Error('hash mismatch ' + rel);
      }
    });
  }

  await record('getStream reads a Node Readable to string', async () => {
    const value = await getStream(Readable.from(['unicorn\n']));
    if (value !== 'unicorn\n') throw new Error('unexpected value ' + JSON.stringify(value));
  });

  await record('getStreamAsBuffer reads a Node Readable to Buffer', async () => {
    const value = await mod.getStreamAsBuffer(Readable.from([Buffer.from('unicorn\n')]));
    if (!Buffer.isBuffer(value) || value.toString() !== 'unicorn\n') throw new Error('unexpected buffer ' + String(value));
  });

  await record('getStreamAsArrayBuffer reads to ArrayBuffer', async () => {
    const value = await mod.getStreamAsArrayBuffer(Readable.from(['unicorn\n']));
    if (!(value instanceof ArrayBuffer) || Buffer.from(value).toString() !== 'unicorn\n') throw new Error('unexpected arraybuffer');
  });

  await record('getStreamAsArray reads an object stream', async () => {
    const value = await mod.getStreamAsArray(Readable.from([{ a: 1 }, { b: 2 }], { objectMode: true }));
    if (!Array.isArray(value) || value.length !== 2 || value[0].a !== 1 || value[1].b !== 2) throw new Error('unexpected array');
  });

  await record('getStream reads a web ReadableStream', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('unicorn\n'));
        controller.close();
      },
    });
    const value = await getStream(body);
    if (value !== 'unicorn\n') throw new Error('unexpected web stream value ' + JSON.stringify(value));
  });

  await record('getStream reads an async iterable', async () => {
    const value = await getStream(async function* () { yield 'unicorn\n'; }());
    if (value !== 'unicorn\n') throw new Error('unexpected iterable value');
  });

  await record('maxBuffer throws MaxBufferError with bufferedData', async () => {
    try {
      await getStream(Readable.from(['unicorn\n']), { maxBuffer: 2 });
      throw new Error('did not throw');
    } catch (error) {
      if (!(error instanceof MaxBufferError)) throw new Error('wrong error type: ' + (error && error.name));
      if (error.bufferedData !== 'un') throw new Error('unexpected bufferedData ' + JSON.stringify(error.bufferedData));
    }
  });

  await record('stream error exposes bufferedData', async () => {
    const stream = new Readable({ read() { this.push('abc'); this.destroy(new Error('boom')); } });
    try {
      await getStream(stream);
      throw new Error('did not throw');
    } catch (error) {
      if (error.message !== 'boom') throw new Error('wrong error: ' + error.message);
      if (error.bufferedData !== 'abc') throw new Error('unexpected bufferedData ' + JSON.stringify(error.bufferedData));
    }
  });

  await record('invalid first argument throws TypeError', async () => {
    try { await getStream('not a stream'); throw new Error('did not throw'); }
    catch (error) { if (!(error instanceof TypeError)) throw new Error('wrong error: ' + (error && error.name)); }
  });

  const failed = checks.filter((c) => c.status !== 'passed');
  const result = {
    status: failed.length ? 'failed' : 'passed',
    packageName: name,
    packageVersion: config.packageVersion,
    packageSha256: config.packageSha256 || null,
    checks,
    total: checks.length,
    pass: checks.length - failed.length,
    fail: failed.length,
  };
  if (outBase) {
    fs.mkdirSync(path.dirname(outBase), { recursive: true });
    fs.writeFileSync(outBase + '.json', JSON.stringify(result, null, 2) + '\n');
  }
  return result;
}

module.exports = { run };
