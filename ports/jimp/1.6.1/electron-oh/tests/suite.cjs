'use strict';
// Host-safe jimp regression: installs the exact candidate tgz and asserts package identity,
// unchanged dist hashes, and core pure-JS image operations. This is NOT device evidence.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

async function run(config, outDir) {
  const results = [];
  let pkg;
  try {
    pkg = require(config.packageName);
  } catch (e) {
    return { status: 'failed', error: String(e.stack || e), results: [] };
  }
  const { Jimp, loadFont, measureText } = pkg;
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const record = async (name, fn) => {
    const start = Date.now();
    try { await fn(); results.push({ name, status: 'passed', detail: '', ms: Date.now() - start }); }
    catch (e) { results.push({ name, status: 'failed', detail: String(e.stack || e), ms: Date.now() - start }); }
  };

  const pkgRoot = path.dirname(require.resolve(config.packageName + '/package.json'));
  const pkgMeta = require(config.packageName + '/package.json');
  const fonts = require(config.packageName + '/fonts');

  await record('package identity', () => {
    assert.strictEqual(pkgMeta.version, config.packageVersion);
    assert.strictEqual(pkgMeta.name, config.packageName);
    assert.strictEqual(typeof Jimp, 'function');
    assert.strictEqual(typeof loadFont, 'function');
  });

  const LIB_FILES = config.libraryFiles || {};
  for (const [rel, expected] of Object.entries(LIB_FILES)) {
    await record('unchanged dist ' + rel, () => {
      assert.strictEqual(sha(fs.readFileSync(path.join(pkgRoot, rel))), expected);
    });
  }

  await record('create image + pixel round-trip', () => {
    const img = new Jimp({ width: 3, height: 3, color: 0xffffffff });
    img.setPixelColor(0xff0000ff, 0, 0);
    assert.strictEqual(img.getPixelColor(0, 0), 0xff0000ff);
    assert.strictEqual(img.bitmap.width, 3);
    assert.strictEqual(img.bitmap.height, 3);
  });

  await record('PNG encode/decode round-trip', async () => {
    const img = new Jimp({ width: 3, height: 3, color: 0xffffffff });
    const buf = await img.getBuffer('image/png');
    assert.strictEqual(buf.slice(0, 4).toString('hex'), '89504e47');
    const back = await Jimp.fromBuffer(buf);
    assert.strictEqual(back.bitmap.width, 3);
    assert.strictEqual(back.bitmap.height, 3);
  });

  await record('resize + flip output', () => {
    const src = new Jimp({ width: 10, height: 20, color: 0x000000ff });
    const r = src.clone().resize({ w: 5, h: 10 });
    assert.strictEqual(r.bitmap.width, 5);
    assert.strictEqual(r.bitmap.height, 10);
    const f = src.clone().flip({ horizontal: true, vertical: true });
    assert.strictEqual(f.bitmap.width, 10);
  });

  await record('invert color behavior', () => {
    const img = new Jimp({ width: 1, height: 1, color: 0xff8000ff });
    img.invert();
    const p = img.getPixelColor(0, 0);
    // jimp getPixelColor returns RGBA packed as (r<<24)|(g<<16)|(b<<8)|a
    assert.strictEqual((p >> 24) & 0xff, 0x00); // R 0xff -> 0x00
    assert.strictEqual((p >> 16) & 0xff, 0x7f); // G 0x80 -> 0x7f
    assert.strictEqual((p >> 8) & 0xff, 0xff);  // B 0x00 -> 0xff
  });

  await record('font load + measureText smoke', async () => {
    const font = await loadFont(fonts.SANS_10_BLACK);
    const w = measureText(font, 'Hi');
    assert.ok(typeof w === 'number' && w > 0);
  });

  await record('decode invalid buffer throws', async () => {
    let threw = false;
    try { await Jimp.fromBuffer(Buffer.alloc(0)); } catch (e) { threw = true; }
    assert.strictEqual(threw, true);
  });

  const failed = results.filter((r) => r.status !== 'passed');
  const out = { phase: 'candidate', targetId: config.targetId, kind: 'host', status: failed.length ? 'failed' : 'passed', packageName: config.packageName, packageVersion: config.packageVersion, packageSha256: config.packageSha256, results, pass: results.length - failed.length, total: results.length, fail: failed.length };
  if (outDir) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, 'host-results.json'), JSON.stringify(out, null, 2) + '\n'); }
  return out;
}
module.exports = { run };
