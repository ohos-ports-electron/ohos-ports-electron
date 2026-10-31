#!/usr/bin/env node
'use strict';
// Verify the frozen candidate: SHA256 of the tgz and identity must match inputs.lock.json.
// Usage:
//   node tools/verify-candidate.cjs [path-to-tgz]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('node:child_process');

const portDir = path.resolve(__dirname, '..', '..');
const lockPath = path.join(portDir, 'electron-oh/inputs.lock.json');
const defaultTgz = path.join(portDir, 'electron-oh', 'dist', 'ohos-ports-electron-vscode-textmate-9.3.2-electron-oh.0.tgz');
const tgz = process.argv[2] ? path.resolve(process.argv[2]) : defaultTgz;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function main() {
  if (!fs.existsSync(tgz)) { console.error('tgz not found: ' + tgz); process.exit(2); }
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const expectedSha = lock.candidate.tgzSha256;
  const actualSha = sha(fs.readFileSync(tgz));
  console.log('tgz       : ' + tgz);
  console.log('expected  : ' + expectedSha);
  console.log('actual    : ' + actualSha);
  if (actualSha !== expectedSha) { console.error('MISMATCH: candidate tgz hash'); process.exit(1); }

  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vtm-cand-'));
  try {
    execFileSync('tar', ['-xzf', tgz, '-C', tmp]);
    const pkg = path.join(tmp, 'package');
    const pj = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
    if (pj.name !== lock.candidate.name || pj.version !== lock.candidate.version) {
      console.error('MISMATCH: identity ' + pj.name + '@' + pj.version + ' != ' + lock.candidate.name + '@' + lock.candidate.version);
      process.exit(1);
    }
    console.log('identity  : ' + pj.name + '@' + pj.version + ' OK');
    let n = 0;
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const s = path.join(d, e.name); if (e.isDirectory()) walk(s); else if (e.isFile()) n++; } })(pkg);
    console.log('files     : ' + n);
    console.log('VERIFY OK');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
main();
