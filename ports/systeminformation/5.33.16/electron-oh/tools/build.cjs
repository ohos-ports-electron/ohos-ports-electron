#!/usr/bin/env node
'use strict';
// Reproducible candidate build for @ohos-ports-electron/systeminformation 5.33.16-electron-oh.0
//
// Inputs come only from electron-oh/inputs.lock.json + patchs/0001..0005 + upstream source.
// Patch baseline is the upstream SOURCE tree (commit pinned in inputs.lock.upstreamSource),
// NOT the npm tarball (its lib/ differs from the source checkout).
//
// Usage:
//   node electron-oh/tools/build.mjs --source <dir> [--output <bundle>]
//   --archive <tgz> / SI_SOURCE_DIR=<dir>
// --output <bundle> copies the frozen tgz + writes meta.json (CI artifact contract).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFileSync } = require('node:child_process');

const portDir = path.resolve(__dirname, '..', '..');
const patchDir = path.join(portDir, 'patchs');
const lock = JSON.parse(fs.readFileSync(path.join(portDir, 'electron-oh/inputs.lock.json'), 'utf8'));
const staging = path.join(portDir, '.build', 'staging');
const outDir = path.join(portDir, 'electron-oh', 'dist');
const PATCHES = [
  '0001-feat-add-openharmony-to-linux-platform-detection.patch',
  '0002-fix-fsSize-toybox-df-compatibility-BLK-02.patch',
  '0003-fix-guard-cpu-load-division-and-proc-cpuinfo-node-fallbacks.patch',
  '0004-feat-add-ohos-platform-branch.patch',
  '0005-feat-avoid-sync-spawn-on-harmonyos-app-domain.patch',
];
const VERSION = '5.33.16-electron-oh.0';
const NAME = '@ohos-ports-electron/systeminformation';

function sha(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function run(args, cwd) { execFileSync(args[0], args.slice(1), { cwd, stdio: 'inherit' }); }
function parseArgs() {
  const a = process.argv.slice(2);
  let source = null, output = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--source') source = a[i + 1];
    else if (a[i] === '--archive') source = a[i + 1];
    else if (a[i] === '--output') output = a[i + 1];
  }
  source = source || process.env.SI_SOURCE_DIR;
  if (!source) throw Error('需要上游源码输入：--source <dir> / --archive <tgz> / SI_SOURCE_DIR=<dir>（补丁基线 = 源码 commit ' + lock.upstreamSource.commit + '，非 npm tgz）');
  return { source, output };
}
function resolveSource(source) {
  if (!fs.existsSync(source)) throw Error('source 不存在: ' + source);
  const p = fs.statSync(source);
  const tmp = path.join(portDir, '.build', 'src-stage');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  if (p.isFile()) run(['tar', '-xzf', source, '-C', tmp]);
  else fs.cpSync(source, tmp, { recursive: true });
  return tmp;
}
function copyTree(s, d, exclude) {
  fs.mkdirSync(d, { recursive: true });
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    if (exclude.includes(e.name)) continue;
    const sp = path.join(s, e.name), dp = path.join(d, e.name);
    if (e.isDirectory()) copyTree(sp, dp, exclude);
    else if (e.isFile()) fs.copyFileSync(sp, dp);
  }
}
function lfAll(p) {
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const s = path.join(d, e.name); if (e.isDirectory()) walk(s); else if (e.isFile() && /\.(js|json|json5|md|txt|yml|yaml)$/.test(e.name)) { let t = fs.readFileSync(s, 'utf8'); t = t.replace(/\r\n/g, '\n'); fs.writeFileSync(s, t); } } })(p);
}
function toCrlf(p) {
  const s = fs.readFileSync(p).toString('binary').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  fs.writeFileSync(p, Buffer.from(s, 'binary'));
}

const { source: sourceIn, output } = parseArgs();
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
const src = resolveSource(sourceIn);
copyTree(src, staging, ['.git', 'node_modules']);
lfAll(staging);

run(['git', 'init', '-q'], staging);
run(['git', 'config', 'core.autocrlf', 'false'], staging);
run(['git', 'config', 'core.safecrlf', 'false'], staging);
run(['git', 'add', '-A'], staging);
run(['git', '-c', 'user.name=ohpt-build', '-c', 'user.email=ohpt-build@local', 'commit', '-q', '-m', 'baseline'], staging);
for (const p of PATCHES) run(['git', '-c', 'user.name=ohpt-build', '-c', 'user.email=ohpt-build@local', 'am', path.join(patchDir, p)], staging);

const pj = JSON.parse(fs.readFileSync(path.join(staging, 'package.json'), 'utf8'));
pj.name = NAME;
pj.version = VERSION;
pj.description = 'Advanced, lightweight system and OS information library (HarmonyOS PC / ohos-ports port of systeminformation)';
pj.repository = { type: 'git', url: 'git+https://github.com/ohos-ports-electron/ohos-ports-electron.git', directory: 'ports/systeminformation/5.33.16' };
pj.homepage = 'https://systeminformation.io';
pj.os = ['darwin', 'linux', 'win32', 'freebsd', 'openbsd', 'netbsd', 'sunos', 'android', 'openharmony', 'ohos'];
delete pj.bugs; delete pj.scripts;
fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify(pj, null, 2) + '\n');
fs.rmSync(path.join(staging, '.git'), { recursive: true, force: true });

for (const m of lock.candidate.crlfMembers || []) {
  if (!fs.existsSync(path.join(staging, m))) throw Error('crlfMembers 条目在 staging 中不存在: ' + m);
  toCrlf(path.join(staging, m));
}
(function fixModes(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) fixModes(p);
    else if (e.isFile()) fs.chmodSync(p, 0o644);
  }
})(staging);

fs.mkdirSync(outDir, { recursive: true });
const npmCli = [
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
].find((p) => fs.existsSync(p));
if (!npmCli) throw Error('node 未捆绑 npm-cli.js: ' + process.execPath);
const r = execFileSync(process.execPath, [npmCli, 'pack', '--pack-destination', outDir, '--json', staging], { encoding: 'utf8' });
const parsed = JSON.parse(r)[0];
const tgz = path.join(outDir, parsed.filename);
async function applyFrozenArchive() {
  const url = lock.candidate.archiveUrl;
  if (!url || !url.startsWith('https://')) throw Error('candidate hash mismatch vs inputs.lock（gzip 平台差异且未锁定冻结归档 URL）');
  console.log('gzip bytes differ from the frozen candidate (platform variance); fetching locked archive');
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw Error('frozen archive fetch failed: HTTP ' + response.status);
  if (!response.url.startsWith('https://')) throw Error('frozen archive HTTPS downgrade');
  const frozen = Buffer.from(await response.arrayBuffer());
  if (frozen.length > 64 * 1024 * 1024) throw Error('frozen archive exceeds size limit');
  if (sha(frozen) !== lock.candidate.tgzSha256) throw Error('frozen candidate checksum mismatch');
  if (sha(zlib.gunzipSync(frozen)) !== lock.candidate.candidateTarSha256) throw Error('frozen candidate tar mismatch');
  fs.writeFileSync(tgz, frozen);
  console.log('frozen candidate applied (device-tested bytes)');
  return sha(frozen);
}

(async () => {
  const tarBuf = zlib.gunzipSync(fs.readFileSync(tgz));
  const tarSha = sha(tarBuf);
  console.log('candidate tgz:', path.relative(portDir, tgz));
  console.log('tar sha256:', tarSha);
  console.log('expected tar:', lock.candidate.candidateTarSha256);
  if (tarSha !== lock.candidate.candidateTarSha256) {
    console.error('node ' + process.versions.node + '; npmCli ' + npmCli);
    let off = 0;
    while (off + 512 <= tarBuf.length) {
      const name = tarBuf.subarray(off, off + 100).toString().replace(/\0.*$/, '');
      if (!name) break;
      const size = parseInt(tarBuf.subarray(off + 124, off + 136).toString().replace(/\0.*$/, '').trim() || '0', 8) || 0;
      const mode = tarBuf.subarray(off + 100, off + 108).toString().replace(/\0.*$/, '').trim();
      const mtime = tarBuf.subarray(off + 136, off + 148).toString().replace(/\0.*$/, '').trim();
      console.error(String.fromCharCode(tarBuf[off + 156]) + ' ' + (mode || '0') + ' ' + (mtime || '0') + ' ' + size + ' ' + sha(tarBuf.subarray(off + 512, off + 512 + size)) + ' ' + name);
      off += 512 + Math.ceil(size / 512) * 512;
    }
    throw Error('candidate tar mismatch vs inputs.lock: ' + tarSha + ' != ' + lock.candidate.candidateTarSha256);
  }
  let tgzSha = sha(fs.readFileSync(tgz));
  if (tgzSha !== lock.candidate.tgzSha256) tgzSha = await applyFrozenArchive();
  console.log('sha256:', tgzSha);
  if (output) {
    fs.mkdirSync(output, { recursive: true });
    fs.copyFileSync(tgz, path.join(output, 'candidate.tgz'));
    fs.writeFileSync(path.join(output, 'meta.json'), JSON.stringify({ packageName: NAME, packageVersion: VERSION, candidateSha256: tgzSha, expectedSha256: lock.candidate.tgzSha256 }, null, 2) + '\n');
    console.log('bundle written to', output);
  }
  console.log('BUILD OK');
})().catch((err) => { console.error(err && err.stack || err); process.exit(1); });
