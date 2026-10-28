'use strict';
// OHOS binaries cannot execute on Linux/macOS. These checks exercise real JS and
// loader dispatch with controlled native stand-ins; they are not device tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.argv[2];
const { DOMMatrix, DOMPoint, DOMRect } = require(path.join(root, 'geometry.js'));
const cases = [];
function check(name, fn) { fn(); cases.push({ name, status: 'passed' }); }
function approximate(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8); }
check('geometry-affine-transform', () => {
  const p = new DOMMatrix([2, 0, 0, 3, 4, 5]).transformPoint(new DOMPoint(1, 2));
  assert.deepEqual([p.x, p.y, p.z, p.w], [6, 11, 0, 1]);
});
check('geometry-inverse-roundtrip', () => {
  const m = new DOMMatrix([2, 1, 0.5, 3, 4, 5]);
  const p = m.inverse().transformPoint(m.transformPoint(new DOMPoint(7, -3)));
  approximate(p.x, 7); approximate(p.y, -3);
});
check('geometry-multiply-composition', () => {
  const m = new DOMMatrix([1, 0, 0, 1, 10, 20]).multiply(new DOMMatrix([2, 0, 0, 3, 0, 0]));
  const p = m.transformPoint(new DOMPoint(2, 3));
  assert.deepEqual([p.x, p.y], [14, 29]);
});
check('geometry-rectangle-bounds', () => {
  const r = new DOMRect(10, 20, 4, 6);
  assert.deepEqual([r.left, r.top, r.right, r.bottom], [10, 20, 14, 26]);
});
const code = fs.readFileSync(path.join(root, 'js-binding.js'), 'utf8');
function load({ platform, electron = '', override = '', fail = false }) {
  const calls = [], binding = { marker: 'selected-native' };
  const context = { module: { exports: {} }, exports: {}, console,
    process: { platform, arch: 'arm64', versions: electron ? { electron } : {}, env: override ? { NAPI_RS_NATIVE_LIBRARY_PATH: override } : {} },
    require(name) {
      if (name === 'fs') return fs;
      calls.push(name);
      if (fail) throw new Error('native-load-failure:' + name);
      return binding;
    } };
  vm.runInNewContext(code, context, { filename: 'js-binding.js' });
  assert.equal(context.module.exports, binding);
  return calls;
}
for (const platform of ['ohos', 'openharmony']) {
  check('loader-node-' + platform, () => {
    assert.deepEqual(load({ platform }), ['./skia.openharmony-arm64.node']);
  });
  check('loader-electron-' + platform, () => {
    assert.deepEqual(load({ platform, electron: '37.2.0' }), ['/data/storage/el1/bundle/libs/arm64/skia.electron-oh-arm64.node']);
  });
}
check('loader-explicit-path-without-electron-marker', () => {
  assert.deepEqual(load({ platform: 'ohos', override: '/signed-hap/explicit-electron.node' }), ['/signed-hap/explicit-electron.node']);
});
check('loader-preserves-explicit-override-priority', () => {
  assert.deepEqual(load({ platform: 'openharmony', electron: '37.2.0', override: '/signed-hap/custom.node' }), ['/signed-hap/custom.node']);
});
check('loader-failure-remains-visible', () => {
  assert.throws(() => load({ platform: 'ohos', electron: '37.2.0', fail: true }), error => {
    assert.match(error.message, /native-load-failure:.*skia\.electron-oh-arm64\.node/);
    assert.ok(Array.isArray(error.cause));
    assert.equal(error.cause.length, 2);
    assert.match(error.cause[0].message, /libs\/arm64\//);
    assert.match(error.cause[1].message, /libs\/arm64-v8a\//);
    return true;
  });
});
process.stdout.write(JSON.stringify(cases));
