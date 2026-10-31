#!/usr/bin/env node
// ports/vscode-native-watchdog/1.4.6 · 发布门禁与执行（默认禁发）。
// 用法：
//   node release.cjs --bundle <dir>                      # 只校验（PR/本地）
//   node release.cjs --bundle <dir> --execute            # 校验通过后执行 npm publish（需 ENABLE_ELECTRON_OH_PUBLISH=1）
// 校验：交接 manifest 与当前 checkout 的 inputs.lock.json 三重哈希一致；候选 tar 与
// 基线/补丁/原生锁同源；环境守卫（GITHUB_ENVIRONMENT / 事件语义）由调用方 workflow 保证。
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const here = __dirname
const portRoot = path.resolve(here, '..', '..')
const lock = JSON.parse(fs.readFileSync(path.join(here, '..', 'inputs.lock.json'), 'utf8'))

const argv = process.argv.slice(2)
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const bundle = arg('--bundle')
const execute = argv.includes('--execute')
if (!bundle) { console.error('usage: release.cjs --bundle <dir> [--execute]'); process.exit(2) }

const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')

const manifestPath = path.join(bundle, 'manifest.json')
const tgz = path.join(bundle, 'candidate.tgz')
if (!fs.existsSync(manifestPath) || !fs.existsSync(tgz)) {
  console.error('bundle incomplete: manifest.json / candidate.tgz missing'); process.exit(1)
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const tgzSha = sha256File(tgz)

const problems = []
if (manifest.name !== lock.candidate.name) problems.push(`manifest.name ${manifest.name} != ${lock.candidate.name}`)
if (manifest.version !== lock.candidate.version) problems.push(`manifest.version ${manifest.version} != ${lock.candidate.version}`)
if (tgzSha !== lock.candidate.tarballSha256) problems.push(`candidate.tgz sha256 ${tgzSha} != ${lock.candidate.tarballSha256}`)
if (manifest.tarSha256 !== lock.candidate.tarSha256) problems.push(`manifest.tarSha256 ${manifest.tarSha256} != ${lock.candidate.tarSha256}`)
if (manifest.builtFrom.baseline.sha256 !== lock.library.tarballSha256) problems.push('baseline sha256 mismatch')
if (!manifest.matchesLock) problems.push('manifest.matchesLock false')

// registry 幂等核对：同版本同字节跳过；不同字节拒绝；非 404 错误失败
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const view = spawnSync(npmCmd, ['view', `${lock.candidate.name}@${lock.candidate.version}`, 'dist.integrity', '--json'], { encoding: 'utf8', shell: true, timeout: 60000 })
const viewOk = view.status === 0
const notFound = /E404|not found/i.test(String(view.stderr || '') + String(view.stdout || ''))
if (viewOk) {
  const published = JSON.parse(view.stdout)
  if (published && published !== lock.candidate.integrity) {
    console.error(`registry 已存在不同字节版本（integrity ${published}），拒绝覆盖`); process.exit(1)
  }
  if (published === lock.candidate.integrity) {
    console.log(`registry 已有同字节 ${lock.candidate.name}@${lock.candidate.version}，幂等跳过上传`)
    console.log(`维护者手动步骤（如尚未添加）：npm dist-tag add ${lock.candidate.name}@${lock.candidate.version} electron-oh`)
    process.exit(0)
  }
} else if (!notFound) {
  console.error('registry 查询失败（非 404），不发布: ' + (view.stderr || view.stdout)); process.exit(1)
}

if (problems.length) {
  console.error('release verification failed:\n  ' + problems.join('\n  ')); process.exit(1)
}
console.log(`release verification ok: ${lock.candidate.name}@${lock.candidate.version} tgz=${tgzSha}`)

if (!execute) { console.log('dry-run only (no --execute)'); process.exit(0) }
if (process.env.ENABLE_ELECTRON_OH_PUBLISH !== '1') {
  console.error('Electron-OH publication disabled; CI on main must explicitly enable it.'); process.exit(1)
}
if (process.env.GITHUB_ENVIRONMENT && process.env.GITHUB_ENVIRONMENT !== 'npm-publish') {
  console.error('unexpected GITHUB_ENVIRONMENT: ' + process.env.GITHUB_ENVIRONMENT); process.exit(1)
}
const pub = spawnSync(npmCmd, ['publish', tgz, '--access', 'public', '--tag', 'latest'], { stdio: 'inherit', shell: true })
if (pub.status !== 0) { console.error('npm publish failed'); process.exit(1) }

// 发布后回读核对（npm publish-time 扫描期内版本可能短暂 404，轮询至多 20 分钟）
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
let verified = false
for (let i = 0; i < 40 && !verified; i++) {
  sleep(30000)
  const re = spawnSync(npmCmd, ['view', `${lock.candidate.name}@${lock.candidate.version}`, 'dist.integrity', '--json'], { encoding: 'utf8', shell: true, timeout: 60000 })
  if (re.status === 0) {
    const seen = JSON.parse(re.stdout)
    if (seen === lock.candidate.integrity) verified = true
    else { console.error('registry integrity 与锁不一致: ' + seen); process.exit(1) }
  }
}
if (!verified) { console.error('发布后 20 分钟内 registry 未回读到该版本；请人工核对后再结束'); process.exit(1) }
console.log(`published + registry verified: ${lock.candidate.name}@${lock.candidate.version} (latest)`)
console.log(`维护者手动步骤（OIDC 身份只覆盖 npm publish）：npm dist-tag add ${lock.candidate.name}@${lock.candidate.version} electron-oh`)
