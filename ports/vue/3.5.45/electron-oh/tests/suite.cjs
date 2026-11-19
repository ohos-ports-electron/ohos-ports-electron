'use strict';
/* Host-safe regression suite for @ohos-ports-electron/vue (CI compatibility job).
 * Runs on plain Node (Linux CI) against the installed candidate tgz.
 * Cases mirror the device roster's host-safe subset: package identity, unchanged
 * distributed JS entry hashes, reactivity contracts, component render + SSR output,
 * compiler-sfc contracts and the @vue/* runtime dependency closure. No device or
 * OHOS-specific behavior is claimed. */
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const definitions = [
  ['package identity', async c => c.equal(JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8')).name, c.config.packageName)],
  ['unchanged distributed JavaScript entries', async c => {
    const hashes = {}; for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel); hashes[rel] = actual;
    } c.equal(Object.keys(hashes).length, Object.keys(c.config.libraryFiles).length);
  }],
  ['runtime dependency closure resolves the five monorepo siblings at 3.5.45', async c => {
    const deps = ['@vue/shared', '@vue/runtime-dom', '@vue/compiler-dom', '@vue/compiler-sfc', '@vue/server-renderer'];
    for (const dep of deps) {
      const meta = JSON.parse(native.readFileSync(require.resolve(dep + '/package.json'), 'utf8'));
      c.equal(meta.version, '3.5.45');
    }
  }],
  ['reactivity contracts: reactive/ref/computed/effect', async c => {
    const { reactive, ref, computed, effect, isReactive, toRaw } = c.vue;
    const state = reactive({ count: 0, nested: { deep: 1 } });
    let hits = 0, last;
    effect(() => { last = state.nested.deep; hits++; });
    c.equal(`${last}/${hits}`, '1/1');
    state.nested.deep = 2;
    c.equal(`${last}/${hits}`, '2/2');
    c.equal(`${isReactive(state)}/${isReactive({})}`, 'true/false');
    const raw = { x: 1 };
    c.equal(toRaw(reactive(raw)) === raw, true);
    const n = ref(1);
    const doubled = computed(() => n.value * 2);
    c.equal(doubled.value, 2);
    n.value = 21;
    c.equal(doubled.value, 42);
  }],
  ['component render through server-renderer matches expected html', async c => {
    const { createApp, h, ref } = c.vue;
    const { renderToString } = require(c.config.packageName + '/server-renderer');
    const msg = ref('hello');
    const html = await renderToString(createApp({
      render: () => h('div', { id: 'app' }, [h('p', { class: 'greet' }, msg.value), h('span', null, ['!'])]),
    }));
    c.equal(html, '<div id="app"><p class="greet">hello</p><span>!</span></div>');
  }],
  ['compiler-sfc parse/compileScript/compileTemplate contracts', async c => {
    const { parse, compileScript, compileTemplate } = require(c.config.packageName + '/compiler-sfc');
    const source = '<script setup>\nconst props = defineProps({ msg: String })\nconst n = computed(() => props.msg + \'!\')\n</script>\n\n<template><div>{{ msg }}</div></template>\n';
    const { descriptor, errors } = parse(source, { filename: 'comp.vue' });
    c.equal(errors.length, 0);
    const script = compileScript(descriptor, { id: 'scope', templateOptions: { id: 'scope' } }).content;
    c.equal(script.includes('props: { msg: String }') && script.includes('const props = __props'), true);
    const tpl = compileTemplate({ source: descriptor.template.content, filename: 'comp.vue', id: 'scope' });
    c.equal(tpl.errors.length, 0);
    c.equal(/_ctx\.msg/.test(tpl.code), true);
  }],
  ['version and exports surface match upstream 3.5.45', async c => {
    const expected = ['reactive', 'ref', 'computed', 'watch', 'watchEffect', 'effect', 'h', 'createApp', 'defineComponent', 'onMounted', 'nextTick', 'createRenderer', 'compile', 'useTemplateRef'];
    c.equal(c.vue.version, '3.5.45');
    for (const k of expected) c.equal(typeof c.vue[k], 'function', 'export ' + k);
  }],
];

async function run(config, outputDir) {
  const startedAt = new Date().toISOString(); const runId = crypto.randomBytes(12).toString('hex');
  const results = []; let vue; let pkg; let loadError;
  try {
    vue = require(config.packageName);
    let d = path.dirname(require.resolve(config.packageName + '/package.json'));
    const meta = JSON.parse(native.readFileSync(path.join(d, 'package.json'), 'utf8'));
    assert.strictEqual(meta.name, config.packageName); pkg = d;
  } catch (e) { loadError = e; }
  const root = path.join(outputDir, 'vue-' + process.pid + '-' + runId); native.mkdirSync(root, { recursive: true });
  for (const [name, body] of definitions) {
    const start = Date.now(); let expected = null, actual = null, status = 'passed', error = null, skipReason = null; let assertions = 0;
    const context = {
      vue, pkg, config, root, p: s => path.join(root, s),
      equal: (a, b) => { expected = b; actual = a; assertions++; assert.deepStrictEqual(a, b); },
      skip: (reason) => { skipReason = reason; },
    };
    try { if (loadError) throw loadError; await body(context); if (skipReason) { status = 'not-run'; } else { assert(assertions > 0, 'case did not record an assertion'); } } catch (e) { status = 'failed'; error = { name: e.name, code: e.code, message: e.message, stack: e.stack }; }
    const result = { name, status, expected, actual, durationMs: Date.now() - start, error, skipReason }; results.push(result);
    console.log('VUE_CASE ' + JSON.stringify({ runId, pid: process.pid, ...result }));
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
  console.log('VUE_DONE ' + JSON.stringify({ runId, pid: process.pid, status: report.status, pass: report.pass, total: report.total }));
  return report;
}
module.exports = { run, definitions };
