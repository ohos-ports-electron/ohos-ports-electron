// ports/vscode-native-watchdog/1.4.6 · 从锁定基线 + 锁定原生归档重放候选 tgz。
//
// 输入（三选一组合，全部哈希对账 inputs.lock.json / native-artifact.lock.json）：
//   --baseline <tgz>       基线 tgz 本地路径（缺省时从 lock.library.tarballUrl 下载）
//   --native-dir <dir>     原生目录（watchdog-node.node + watchdog-electron.node）
//   --native-url <url>     原生归档 URL（tar.gz；成员 sha256 逐一校验）——CI 构建通道
// 输出：
//   --output <dir>         产物交接目录：candidate.tgz + manifest.json
//   --verify               候选三重哈希必须与 inputs.lock.json 完全一致
//
// 与阶段 01 工程的差别：本文件在 ports 位置独立工作（无 .. 层级依赖），基线/原生均按锁显式获取。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const portRoot = path.resolve(here, '..', '..') // ports/vscode-native-watchdog/1.4.6
const lock = JSON.parse(fs.readFileSync(path.join(here, '..', 'inputs.lock.json'), 'utf8'))
const nativeLock = JSON.parse(fs.readFileSync(path.join(here, '..', 'native-artifact.lock.json'), 'utf8'))

const argv = process.argv.slice(2)
const arg = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}
const wantVerify = argv.includes('--verify')
const outDir = path.resolve(arg('--output') || path.join(portRoot, 'electron-oh', '.tmp-candidate'))

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const sha256File = (p) => sha256(fs.readFileSync(p))

function download (url, dest) {
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl'
  const r = spawnSync(curl, ['-L', '--fail', '--retry', '2', '-o', dest, url], { encoding: 'utf8', timeout: 300000 })
  if (r.status !== 0) throw new Error('download failed: ' + url + ' (' + (r.stderr || r.stdout || '') + ')')
}

// ---- 1. 基线 tgz ----
let baseTgz = arg('--baseline')
if (!baseTgz) {
  const tmpBase = path.join(here, '.tmp-input')
  fs.mkdirSync(tmpBase, { recursive: true })
  baseTgz = path.join(tmpBase, 'baseline.tgz')
  if (!fs.existsSync(baseTgz)) download(lock.library.tarballUrl, baseTgz)
} else {
  baseTgz = path.resolve(baseTgz)
}
if (!fs.existsSync(baseTgz)) throw new Error('基线 tgz 缺失: ' + baseTgz)
const baseSha = sha256File(baseTgz)
if (baseSha !== lock.library.tarballSha256) throw new Error(`基线 tgz sha256 不符: ${baseSha} != ${lock.library.tarballSha256}`)

// ---- 2. 原生双 ABI addon ----
const work = path.join(here, '.tmp-build')
fs.rmSync(work, { recursive: true, force: true })
fs.mkdirSync(work, { recursive: true })
const nativeDir = path.join(work, 'native')
fs.mkdirSync(nativeDir, { recursive: true })

function extractTarGz (archive, dest) {
  const t = spawnSync('tar', ['-xzf', archive, '-C', dest], { encoding: 'utf8' })
  if (t.status !== 0) throw new Error('tar: ' + (t.stderr || ''))
}

const nativeUrl = arg('--native-url')
if (nativeUrl) {
  const tmpArchive = path.join(work, 'native.tar.gz')
  download(nativeUrl, tmpArchive)
  const archiveSha = sha256File(tmpArchive)
  if (archiveSha !== nativeLock.archiveSha256) throw new Error(`原生归档 sha256 不符: ${archiveSha} != ${nativeLock.archiveSha256}`)
  extractTarGz(tmpArchive, nativeDir)
  for (const [name, sha] of Object.entries(nativeLock.files)) {
    const p = path.join(nativeDir, name)
    if (!fs.existsSync(p)) throw new Error('原生归档缺成员: ' + name)
    if (sha256File(p) !== sha) throw new Error('原生归档成员 sha256 不符: ' + name)
  }
} else {
  const dir = arg('--native-dir')
  if (!dir) throw new Error('需要 --native-dir <dir> 或 --native-url <url>')
  for (const [member, sha] of Object.entries(nativeLock.files)) {
    if (member === 'native-artifacts.json') continue
    const p = path.join(dir, member)
    if (!fs.existsSync(p)) throw new Error('原生成员缺失: ' + p)
    if (sha256File(p) !== sha) throw new Error('原生成员 sha256 不符: ' + p)
    fs.copyFileSync(p, path.join(nativeDir, member))
  }
}

// ---- 3. 组装候选（与阶段 01 相同的补丁序列）----
const t = spawnSync('tar', ['-xzf', baseTgz, '-C', work, '--strip-components=1'], { encoding: 'utf8' })
if (t.status !== 0) throw new Error('tar: ' + (t.stderr || ''))
const git = (args) => {
  const r = spawnSync('git', ['-C', work, '-c', 'core.autocrlf=false'].concat(args), { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + (r.stderr || r.stdout))
  return r.stdout
}
git(['init', '-q'])
git(['add', '-A'])
git(['-c', 'user.name=port', '-c', 'user.email=port@ohos', 'commit', '-qm', 'baseline'])

const apply = (p, checkFile, marker) => {
  const r = spawnSync('git', ['-C', work, '-c', 'core.autocrlf=false', 'apply', p], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('git apply ' + path.basename(p) + ': ' + r.stderr)
  const content = fs.readFileSync(path.join(work, checkFile), 'utf8')
  if (marker && !content.includes(marker)) throw new Error('补丁内容未生效: ' + path.basename(p))
}
apply(path.join(portRoot, 'patchs', '0001-ohos-electron-addon-path-fallback.patch'), 'index.js', '/data/storage/el1/bundle/electron/libs/arm64/watchdog.node')
apply(path.join(portRoot, 'patchs', '0002-electron-oh-package.patch'), 'package.json', '@ohos-ports-electron/vscode-native-watchdog')

// 原生成员对账后入包
if (sha256File(path.join(nativeDir, 'watchdog-node.node')) !== lock.prebuilt.deviceNode.sha256) throw new Error('device-node ABI addon 哈希不符')
if (sha256File(path.join(nativeDir, 'watchdog-electron.node')) !== lock.prebuilt.electron.sha256) throw new Error('electron ABI addon 哈希不符')
fs.mkdirSync(path.join(work, 'build', 'Release'), { recursive: true })
fs.copyFileSync(path.join(nativeDir, 'watchdog-node.node'), path.join(work, 'build', 'Release', 'watchdog.node'))
fs.mkdirSync(path.join(work, 'electron-oh'), { recursive: true })
fs.copyFileSync(path.join(nativeDir, 'watchdog-electron.node'), path.join(work, 'electron-oh', 'watchdog.node'))

// ---- 4. npm pack + 三重哈希 ----
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const pack = spawnSync(npmCmd, ['pack', '--json'], { cwd: work, encoding: 'utf8', timeout: 180000, shell: true })
if (pack.status !== 0) throw new Error('npm pack: ' + (pack.stderr || pack.stdout))
const packInfo = JSON.parse(pack.stdout)[0]
const pkgName = JSON.parse(fs.readFileSync(path.join(work, 'package.json'), 'utf8')).name
const candidateName = (pkgName.split('/').pop()) + '-' + lock.candidate.version + '.tgz'

fs.mkdirSync(outDir, { recursive: true })
const outTgz = path.join(outDir, 'candidate.tgz')
fs.copyFileSync(path.join(work, packInfo.filename), outTgz)
const tgzSha = sha256File(outTgz)
const tarSha256 = sha256(zlib.gunzipSync(fs.readFileSync(outTgz)))

const manifest = {
  schemaVersion: 1,
  name: pkgName,
  version: lock.candidate.version,
  tarballSha256: tgzSha,
  tarSha256,
  integrity: packInfo.integrity,
  fileCount: packInfo.entryCount,
  lockedTarballSha256: lock.candidate.tarballSha256,
  lockedTarSha256: lock.candidate.tarSha256,
  matchesLock: tgzSha === lock.candidate.tarballSha256 && tarSha256 === lock.candidate.tarSha256,
  builtFrom: {
    baseline: { url: lock.library.tarballUrl, sha256: baseSha },
    patches: ['patchs/0001-ohos-electron-addon-path-fallback.patch', 'patchs/0002-electron-oh-package.patch'],
    native: { archiveSha256: nativeUrl ? nativeLock.archiveSha256 : null, members: Object.keys(nativeLock.files) },
  },
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

if (wantVerify && !manifest.matchesLock) {
  throw new Error(`候选哈希与锁不符: tgz ${tgzSha} / tar ${tarSha256}`)
}
console.log(JSON.stringify({ ok: true, outTgz, ...manifest }, null, 2))
fs.rmSync(work, { recursive: true, force: true })
