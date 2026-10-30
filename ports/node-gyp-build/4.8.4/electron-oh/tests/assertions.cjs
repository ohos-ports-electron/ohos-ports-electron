'use strict';
// node-gyp-build 4.8.4 共享断言（阶段 3 业务套件，device-node / electron-oh 共用；CI 宿主回归亦复用）。
// 断言逻辑与上游 source/test.js 一一对应（保持实际调用与原断言），
// 仅把 tape 断言协议映射为 check(cp, ok, actual, expected)；
// 输入打乱用本地 Fisher-Yates 等价实现（上游 array-shuffle 只做打乱，断言只关心排序结果）。
// 契约：module.exports = { '<caseId>': ({case, check}) => void }；caseId 对应 02-baseline.json 的 name。
const lib = require('@ohos-ports-electron/node-gyp-build');
const { parseTags, matchTags, compareTags, parseTuple, matchTuple, compareTuples } = lib;

function shuffle (arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

const getFile = tags => tags.file
const getTupleName = tuple => tuple.name
function deepEq (a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (typeof a !== 'object') return false
  const aIsArray = Array.isArray(a); const bIsArray = Array.isArray(b)
  if (aIsArray !== bIsArray) return false
  if (aIsArray) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false
    return true
  }
  const ak = Object.keys(a).sort(); const bk = Object.keys(b).sort()
  if (ak.length !== bk.length) return false
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false
    if (!deepEq(a[ak[i]], b[bk[i]])) return false
  }
  return true
}
const enc = v => JSON.stringify(v)

function buildSuite () {
  const suite = {}

  suite['parse tags'] = async function (env) {
    const { check } = env
    let cp = 0
    check(cp++, parseTags('ignored') === undefined, parseTags('ignored'), undefined)
    check(cp++, parseTags('node.ignored') === undefined, parseTags('node.ignored'), undefined)
    check(cp++, parseTags('node.node').runtime === 'node', parseTags('node.node').runtime, 'node')
    check(cp++, parseTags('electron.node').runtime === 'electron', parseTags('electron.node').runtime, 'electron')
    check(cp++, parseTags('node-webkit.node').runtime === 'node-webkit', parseTags('node-webkit.node').runtime, 'node-webkit')
    const napi = parseTags('node.napi.node')
    check(cp++, deepEq(napi, { file: 'node.napi.node', runtime: 'node', napi: true, specificity: 2 }), enc(napi), enc({ file: 'node.napi.node', runtime: 'node', napi: true, specificity: 2 }))
    const musl = parseTags('node.abi64.uv1.armv7.musl.node')
    check(cp++, deepEq(musl, { file: 'node.abi64.uv1.armv7.musl.node', runtime: 'node', abi: '64', uv: '1', armv: '7', libc: 'musl', specificity: 5 }), enc(musl), enc({ file: 'node.abi64.uv1.armv7.musl.node', runtime: 'node', abi: '64', uv: '1', armv: '7', libc: 'musl', specificity: 5 }))
  }

  suite['sort tags'] = async function (env) {
    const { check } = env
    let cp = 0
    const electronSorted = [
      'electron.abi64.uv1.node',
      'electron.napi.uv1.armv7.musl.node',
      'electron.napi.uv1.musl.node',
      'node.abi64.uv1.node',
      'node.abi64.node',
      'node.napi.uv1.armv7.musl.node',
      'node.napi.uv1.node'
    ]
    check(cp++, deepEq(
      shuffle(electronSorted).map(parseTags).sort(compareTags('electron')).map(getFile),
      electronSorted), 'sorted', 'sort order ok')
    const nodeSorted = [
      'node.abi64.uv1.node',
      'node.abi64.node',
      'node.napi.uv1.armv7.musl.node',
      'node.napi.uv1.node',
      'electron.abi64.uv1.node',
      'electron.napi.uv1.armv7.musl.node',
      'electron.napi.uv1.musl.node'
    ]
    check(cp++, deepEq(
      shuffle(nodeSorted).map(parseTags).sort(compareTags('node')).map(getFile),
      nodeSorted), 'sorted', 'same files, different runtime')
  }

  suite['match and sort tags'] = async function (env) {
    const { check } = env
    let cp = 0
    function doCheck (runtime, abi, files, expected, message) {
      check(cp++, deepEq(
        files.map(parseTags).filter(matchTags(runtime, abi)).sort(compareTags(runtime)).map(getFile),
        expected), enc(expected), message)
    }
    doCheck('electron', '64', ['node.abi64.node', 'electron.napi.node'], ['electron.napi.node'], 'dont use a node abi for electron')
    doCheck('electron', '64', ['node.abi64.node', 'node.napi.node'], ['node.napi.node'], 'but do use a node napi for electron')
    doCheck('electron', '64', ['node.abi64.node', 'node.napi.node', 'electron.abi64.node', 'electron.abi99.node', 'electron.napi.node'], ['electron.abi64.node', 'electron.napi.node', 'node.napi.node'], 'except if an electron abi is available')
    doCheck('node', '64', ['electron.napi.node', 'electron.abi64.node', 'node.abi64.node'], ['node.abi64.node'], 'never use electron for node')
  }

  suite['parse tuples'] = async function (env) {
    const { check } = env
    let cp = 0
    const linux = parseTuple('linux-arm64')
    check(cp++, deepEq(linux, { name: 'linux-arm64', platform: 'linux', architectures: ['arm64'] }), enc(linux), enc({ name: 'linux-arm64', platform: 'linux', architectures: ['arm64'] }))
    const darwin = parseTuple('darwin-x64+arm64')
    check(cp++, deepEq(darwin, { name: 'darwin-x64+arm64', platform: 'darwin', architectures: ['x64', 'arm64'] }), enc(darwin), enc({ name: 'darwin-x64+arm64', platform: 'darwin', architectures: ['x64', 'arm64'] }))
    check(cp++, parseTuple('') === undefined, parseTuple(''), undefined)
    check(cp++, parseTuple('linux-') === undefined, parseTuple('linux-'), undefined)
    check(cp++, parseTuple('-arm64') === undefined, parseTuple('-arm64'), undefined)
    check(cp++, parseTuple('linux-arm64+') === undefined, parseTuple('linux-arm64+'), undefined)
    check(cp++, parseTuple('linux-arm64++x64') === undefined, parseTuple('linux-arm64++x64'), undefined)
    check(cp++, parseTuple('linux-+arm64') === undefined, parseTuple('linux-+arm64'), undefined)
  }

  suite['sort tuples'] = async function (env) {
    const { check } = env
    let cp = 0
    const tuples = ['darwin-arm64+x64+ia32', 'darwin-x64', 'darwin-x64+arm64']
    const sorted = tuples.map(parseTuple).sort(compareTuples).map(getTupleName)
    check(cp++, deepEq(sorted, ['darwin-x64', 'darwin-x64+arm64', 'darwin-arm64+x64+ia32']), enc(sorted), enc(['darwin-x64', 'darwin-x64+arm64', 'darwin-arm64+x64+ia32']))
  }

  suite['match tuples'] = async function (env) {
    const { check } = env
    let cp = 0
    const tuples = ['linux-arm64', 'darwin-x64+arm64', 'darwin-x64'].map(parseTuple)
    check(cp++, tuples.filter(matchTuple('darwin', 'x64')).sort(compareTuples)[0].name === 'darwin-x64', tuples.filter(matchTuple('darwin', 'x64')).sort(compareTuples)[0].name, 'darwin-x64')
    check(cp++, tuples.filter(matchTuple('darwin', 'arm64')).sort(compareTuples)[0].name === 'darwin-x64+arm64', tuples.filter(matchTuple('darwin', 'arm64')).sort(compareTuples)[0].name, 'darwin-x64+arm64')
    check(cp++, tuples.filter(matchTuple('linux', 'arm64')).sort(compareTuples)[0].name === 'linux-arm64', tuples.filter(matchTuple('linux', 'arm64')).sort(compareTuples)[0].name, 'linux-arm64')
    check(cp++, tuples.some(matchTuple('linux', 'other')) === false, tuples.some(matchTuple('linux', 'other')), false)
    check(cp++, tuples.some(matchTuple('other', 'arm64')) === false, tuples.some(matchTuple('other', 'arm64')), false)
  }

  return suite
}

module.exports = buildSuite()
