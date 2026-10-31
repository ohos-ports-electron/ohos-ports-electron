#!/usr/bin/env node
// ports/vscode-native-watchdog/1.4.6 · 宿主兼容作业：安装同一候选 tgz 并运行 3 用例回归。
//
// 非 openharmony/ohos 平台上 install.cjs 显式转交 node-gyp rebuild——与上游包
// （binding.gyp 自动检测）有效安装语义一致：宿主从源码编译 watchdog.cc，然后
// 运行与设备侧同一契约的 suite（kill-on-death / start / exit）。
//
// 用法: node run-host.cjs --tgz <candidate.tgz> [--project <dir>]
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')

const argv = process.argv.slice(2)
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const tgz = arg('--tgz')
if (!tgz) { console.error('usage: run-host.cjs --tgz <candidate.tgz> [--project <dir>]'); process.exit(2) }
const project = path.resolve(arg('--project') || fs.mkdtempSync(path.join(os.tmpdir(), 'nw-host-')))
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

fs.mkdirSync(project, { recursive: true })
fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'nw-host-contract', private: true, version: '0.0.0' }, null, 2) + '\n')

const install = spawnSync(npmCmd, ['install', '--no-audit', '--no-fund', path.resolve(tgz)], { cwd: project, encoding: 'utf8', shell: true, timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] })
if (install.status !== 0) {
  console.error('npm install failed:\n' + (install.stdout || '') + (install.stderr || ''))
  process.exit(1)
}
const pkgMain = path.join(project, 'node_modules', '@ohos-ports-electron', 'vscode-native-watchdog', 'index.js')
if (!fs.existsSync(pkgMain)) { console.error('package not installed: ' + pkgMain); process.exit(1) }
const built = path.join(project, 'node_modules', '@ohos-ports-electron', 'vscode-native-watchdog', 'build', 'Release', 'watchdog.node')
if (!fs.existsSync(built)) { console.error('host-compiled addon missing (node-gyp rebuild expected on this platform): ' + built); process.exit(1) }
console.log('[host] installed + host-compiled: ' + built)

process.env.NW_LIB_IDENTITY = pkgMain // suite 以绝对路径 require 候选包
const suite = require(path.join(__dirname, 'suite.cjs'))

;(async () => {
  let failed = 0
  const total = Object.keys(suite).length
  for (const [name, fn] of Object.entries(suite)) {
    const checks = []
    let result = 'fail'
    let detail = ''
    try {
      await fn({
        check: (cp, ok, actual, expected) => {
          checks.push({ cp, ok })
          console.log(`    check cp:${cp} ${ok ? 'ok' : 'FAIL'} actual=${JSON.stringify(actual)} expect=${JSON.stringify(expected)}`)
        },
      })
      result = checks.length > 0 && checks.every((c) => c.ok) ? 'pass' : 'fail'
    } catch (e) {
      detail = String((e && e.stack) || e)
    }
    console.log(`[HOST-CASE ${result}] ${name}${detail ? '\n' + detail : ''}`)
    if (result !== 'pass') failed++
  }
  console.log(`[HOST-SUMMARY total=${total} pass=${total - failed} fail=${failed}]`)
  process.exit(failed ? 1 : 0)
})()
