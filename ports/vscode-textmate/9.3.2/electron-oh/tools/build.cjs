#!/usr/bin/env node
'use strict';
// Reproducible candidate build for @ohos-ports-electron/vscode-textmate 9.3.2-electron-oh.0
//
// Inputs come only from electron-oh/inputs.lock.json. Patch baseline is the npm tarball
// (zero patches): the candidate = locked baseline tgz + package.json metadata rewrite.
//
// Usage:
//   node electron-oh/tools/build.cjs --archive <baseline.tgz> [--output <bundle>]
//   --archive <tgz>          locked baseline npm tarball (sha256 verified against lock)
//   --frozen <tgz>           device-validated frozen candidate tgz (gzip fallback)
//   --output <bundle>        copies the frozen tgz + writes meta.json (CI artifact contract)
//   (no --archive)           downloads baseline from lock.baseline.tarballUrl
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFileSync } = require('node:child_process');

const portDir = path.resolve(__dirname, '..', '..');
const lock = JSON.parse(fs.readFileSync(path.join(portDir, 'electron-oh/inputs.lock.json'), 'utf8'));
const staging = path.join(portDir, '.build', 'staging');
const outDir = path.join(portDir, 'electron-oh', 'dist');
const NAME = lock.candidate.name;
const VERSION = lock.candidate.version;

function sha(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function run(args, cwd) { execFileSync(args[0], args.slice(1), { cwd, stdio: 'inherit' }); }
function parseArgs() {
  const a = process.argv.slice(2);
  let archive = null, frozen = null, output = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--archive') archive = a[i + 1];
    else if (a[i] === '--frozen') frozen = a[i + 1];
    else if (a[i] === '--output') output = a[i + 1];
  }
  return { archive, frozen, output };
}
function download(url, dest) {
  execFileSync('curl', ['-fsSL', '--retry', '2', '-o', dest, url], { encoding: 'utf8' });
}

const { archive, frozen, output } = parseArgs();
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

// 1. Resolve locked baseline tgz and verify sha256
let baseTgz = archive;
if (!baseTgz) {
  const dl = path.join(staging, '..', 'baseline.tgz');
  console.log('downloading locked baseline: ' + lock.baseline.tarballUrl);
  download(lock.baseline.tarballUrl, dl);
  baseTgz = dl;
}
if (!fs.existsSync(baseTgz)) throw Error('baseline tgz not found: ' + baseTgz);
const baseSha = sha(fs.readFileSync(baseTgz));
if (baseSha !== lock.baseline.sha256) {
  throw Error('baseline tgz sha256 mismatch: ' + baseSha + ' != ' + lock.baseline.sha256);
}

// 2. Extract baseline into staging (package/ -> staging root)
run(['tar', '-xzf', baseTgz, '-C', staging, '--strip-components=1']);

// 3. Metadata rewrite (zero functional patches)
const pjPath = path.join(staging, 'package.json');
const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
pj.name = NAME;
pj.version = VERSION;
pj.description = 'VSCode TextMate grammar helpers (HarmonyOS PC / ohos-ports port of vscode-textmate)';
pj.repository = lock.candidate.repository;
pj.bugs = { url: 'https://github.com/ohos-ports-electron/ohos-ports-electron/issues' };
fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + '\n');

// 4. npm pack via node's bundled npm-cli (deterministic modes from `bin`, fixed mtime)
const npmCli = [
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
].find((p) => fs.existsSync(p));
if (!npmCli) throw Error('node 未捆绑 npm-cli.js: ' + process.execPath);
const packed = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--pack-destination', outDir, '--json', staging], { encoding: 'utf8' }))[0];
const tgz = path.join(outDir, packed.filename);

// 5. Verify canonical tar content matches lock
const tarBuf = zlib.gunzipSync(fs.readFileSync(tgz));
const tarSha = sha(tarBuf);
if (tarSha !== lock.candidate.candidateTarSha256) {
  throw Error('candidate tar sha256 mismatch vs inputs.lock: ' + tarSha + ' != ' + lock.candidate.candidateTarSha256);
}

// 6. tgz gzip bytes: use local build if it matches; else frozen archive
(async () => {
  let tgzSha = sha(fs.readFileSync(tgz));
  if (tgzSha !== lock.candidate.tgzSha256) {
    if (frozen && fs.existsSync(frozen) && sha(fs.readFileSync(frozen)) === lock.candidate.tgzSha256) {
      fs.copyFileSync(frozen, tgz);
      tgzSha = lock.candidate.tgzSha256;
    } else if (lock.candidate.archiveUrl && lock.candidate.archiveUrl.startsWith('https://')) {
      const response = await fetch(lock.candidate.archiveUrl, { redirect: 'follow', signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw Error('frozen archive fetch failed: HTTP ' + response.status);
      const frozenBytes = Buffer.from(await response.arrayBuffer());
      if (sha(frozenBytes) !== lock.candidate.tgzSha256) throw Error('frozen archive checksum mismatch');
      fs.writeFileSync(tgz, frozenBytes);
      console.log('frozen candidate applied (device-tested bytes)');
      tgzSha = lock.candidate.tgzSha256;
    } else {
      throw Error(
        'candidate tgz gzip sha256 differs from lock (' + tgzSha + ' != ' + lock.candidate.tgzSha256 + ') and no frozen archive configured. ' +
        'tar content is correct; upload the device-validated frozen tgz to a GitHub Release and set inputs.lock candidate.archiveUrl, ' +
        'or pass --frozen <tgz> for local validation.',
      );
    }
  }

  console.log('candidate tgz:', path.relative(portDir, tgz));
  console.log('tar sha256  :', tarSha);
  console.log('tgz sha256  :', tgzSha);

  // 7. Bundle contract for CI artifact
  if (output) {
    fs.mkdirSync(output, { recursive: true });
    fs.copyFileSync(tgz, path.join(output, 'candidate.tgz'));
    fs.writeFileSync(path.join(output, 'meta.json'), JSON.stringify({ packageName: NAME, packageVersion: VERSION, candidateSha256: tgzSha, expectedSha256: lock.candidate.tgzSha256 }, null, 2) + '\n');
    console.log('bundle written to', output);
  }
  console.log('BUILD OK');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
