'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const {test} = require('node:test');

function page(packages) {
  class Element {
    constructor() { this.children = []; this.style = {}; this.value = ''; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener() {}
  }
  const nodes = new Map();
  const context = vm.createContext({
    document: {
      createElement: () => new Element(),
      getElementById: id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); },
    },
    // loadData starts but never changes the explicitly supplied test dataset.
    fetch: () => new Promise(() => {}),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), context);
  context.allPackages = packages;
  context.currentData = packages;
  context.renderPage();
  return {context, nodes, row: nodes.get('tbody').children[0]};
}
const base = {name: '@ohos-ports-electron/conf', original_name: 'conf', latest_version: '16.0.0-electron-oh.0'};

test('legacy tags do not invent supported Electron versions', () => {
  const {row} = page([{...base, electron_oh_version: base.latest_version}]);
  assert.equal(row.children[2].children[0].textContent, base.latest_version);
  assert.equal(row.children[3].children[0].textContent, '—');
  assert.equal(row.children[6].children[0].textContent, 'npm i @ohos-ports-electron/conf@' + base.latest_version);
});

test('display and pinned install both use latest when beta differs', () => {
  const {row} = page([{...base, beta_version: '15.0.0-beta.1', electron_oh_version: base.latest_version}]);
  assert.equal(row.children[2].children[0].textContent, base.latest_version);
  assert.equal(row.children[3].children[0].textContent, '—');
  assert.equal(row.children[6].children[0].textContent, 'npm i @ohos-ports-electron/conf@' + base.latest_version);
});

test('Electron filter requires explicit compatibility metadata', () => {
  const {row, context} = page([{...base}]);
  assert.equal(row.children[3].children[0].textContent, '—');
  assert.equal(row.children[6].children[0].textContent, 'npm i @ohos-ports-electron/conf@' + base.latest_version);
  context.currentFilter = 'electron';
  context.allPackages = [{...base, beta_version: base.latest_version}];
  assert.equal(context.getFiltered().length, 0);
  context.allPackages = [{...base, electron: ['37', '40']}];
  assert.equal(context.getFiltered().length, 1);
});


test('supported versions come from annotations and retain their conditions', () => {
  const axios = {name: '@ohos-ports-electron/axios', original_name: 'axios', latest_version: '1.21.0-electron-oh.0', beta_version: '1.21.0-electron-oh.0', electron: ['25', '34', '37', '40'], electron_note: 'Recorded acceptance only'};
  const {row, context} = page([axios]);
  assert.equal(row.children.length, 7);
  assert.deepEqual(row.children[3].children.map(node => node.textContent), axios.electron);
  assert.equal(row.children[3].children[0].title, axios.electron_note);
  assert.equal(row.children[6].children[0].textContent, 'npm i @ohos-ports-electron/axios@' + axios.latest_version);
  context.currentFilter = 'electron';
  assert.equal(context.getFiltered().length, 1);
});

test('process compatibility requires true and distinguishes preliminary renderers', () => {
  const cases = [
    [{}, ['—']],
    [{main: null, renderer: null}, ['—']],
    [{main: true, renderer: null}, ['✅ 主进程']],
    [{main: null, renderer: true}, ['✅ 渲染进程']],
    [{main: true, renderer: true}, ['✅ 主进程', '✅ 渲染进程']],
    [{main: true, renderer: true, renderer_status: 'preliminary'}, ['✅ 主进程', '△ 渲染进程（初评）']],
    [{main: false, renderer: false}, ['—']],
    [{main: 'true', renderer: 1}, ['—']],
  ];
  for (const [processes, expected] of cases) {
    const {row} = page([{...base, ...processes}]);
    assert.deepEqual(row.children[4].children.map(node => node.textContent), expected);
    assert.equal(row.children[5].children[0].textContent, '已发布');
    assert.equal(row.children[6].children[0].textContent, 'npm i ' + base.name + '@' + base.latest_version);
  }
});

test('catalog deprecation appears in row, stats and deprecated filter', () => {
  const {row, nodes, context} = page([{...base, deprecated: true, deprecated_source: 'catalog', deprecated_message: 'Maintainer decision'}]);
  const badge = row.children[5].children[0];
  assert.equal(badge.textContent, '已废弃');
  assert.equal(badge.title, '本站维护标记：Maintainer decision');
  context.renderStats();
  assert.equal(nodes.get('stats').children[2].children[0].textContent, 1);
  context.currentFilter = 'deprecated';
  assert.equal(context.getFiltered().length, 1);
});

test('preliminary badge explains renderer conditions', () => {
  const {row} = page([{...base, renderer: true, renderer_status: 'preliminary', renderer_note: 'Bundle browser entry; no device acceptance'}]);
  const badge = row.children[4].children[0];
  assert.equal(badge.className, 'process-tag process-preliminary');
  assert.equal(badge.title, 'Bundle browser entry; no device acceptance');
});
