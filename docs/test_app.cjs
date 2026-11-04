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

test('legacy electron-oh does not populate the beta channel or install command', () => {
  const {row} = page([{...base, electron_oh_version: base.latest_version}]);
  assert.equal(row.children[2].children[0].textContent, base.latest_version);
  assert.equal(row.children[3].children[0].textContent, '—');
  assert.equal(row.children[5].children[0].textContent, 'npm i @ohos-ports-electron/conf');
});

test('beta retains priority when both channels exist, even with a newer latest', () => {
  const {row} = page([{...base, beta_version: '15.0.0-beta.1', electron_oh_version: base.latest_version}]);
  assert.equal(row.children[3].children[0].textContent, '15.0.0-beta.1');
  assert.equal(row.children[5].children[0].textContent, 'npm i @ohos-ports-electron/conf@beta');
});

test('version suffix never invents a channel and beta filter remains beta-only', () => {
  const {row, context} = page([{...base}]);
  assert.equal(row.children[3].children[0].textContent, '—');
  assert.equal(row.children[5].children[0].textContent, 'npm i @ohos-ports-electron/conf');
  context.currentFilter = 'beta';
  context.allPackages = [{...base, electron_oh_version: base.latest_version}];
  assert.equal(context.getFiltered().length, 0);
});
