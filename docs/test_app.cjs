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

test('legacy electron-oh does not populate beta or change installation policy', () => {
  const {row} = page([{...base, electron_oh_version: base.latest_version}]);
  assert.equal(row.children[2].children[0].textContent, base.latest_version);
  assert.equal(row.children[3].children[0].textContent, '—');
  assert.equal(row.children[6].children[0].textContent, 'npm i @ohos-ports-electron/conf');
});

test('beta retains priority when both channels exist, even with a newer latest', () => {
  const {row} = page([{...base, beta_version: '15.0.0-beta.1', electron_oh_version: base.latest_version}]);
  assert.equal(row.children[3].children[0].textContent, '15.0.0-beta.1');
  assert.equal(row.children[6].children[0].textContent, 'npm i @ohos-ports-electron/conf@beta');
});

test('version suffix never invents a channel and beta filter remains beta-only', () => {
  const {row, context} = page([{...base}]);
  assert.equal(row.children[3].children[0].textContent, '—');
  assert.equal(row.children[6].children[0].textContent, 'npm i @ohos-ports-electron/conf');
  context.currentFilter = 'beta';
  context.allPackages = [{...base, electron_oh_version: base.latest_version}];
  assert.equal(context.getFiltered().length, 0);
});


test('Axios beta renders the validated version and beta install command', () => {
  const axios = {name: '@ohos-ports-electron/axios', original_name: 'axios', latest_version: '1.21.0-electron-oh.0', beta_version: '1.21.0-electron-oh.0', electron_oh_version: null};
  const {row, context} = page([axios]);
  assert.equal(row.children.length, 7);
  assert.equal(row.children[3].children[0].textContent, axios.beta_version);
  assert.equal(row.children[6].children[0].textContent, 'npm i @ohos-ports-electron/axios@beta');
  context.currentFilter = 'beta';
  assert.equal(context.getFiltered().length, 1);
});

test('process compatibility shows only explicitly verified processes', () => {
  const cases = [
    [{}, ['—']],
    [{main: null, renderer: null}, ['—']],
    [{main: true, renderer: null}, ['✅ 主进程']],
    [{main: null, renderer: true}, ['✅ 渲染进程']],
    [{main: true, renderer: true}, ['✅ 主进程', '✅ 渲染进程']],
    [{main: false, renderer: false}, ['—']],
    [{main: 'true', renderer: 1}, ['—']],
  ];
  for (const [processes, expected] of cases) {
    const {row} = page([{...base, ...processes}]);
    assert.deepEqual(row.children[4].children.map(node => node.textContent), expected);
    assert.equal(row.children[5].children[0].textContent, '已发布');
    assert.equal(row.children[6].children[0].textContent, 'npm i ' + base.name);
  }
});
