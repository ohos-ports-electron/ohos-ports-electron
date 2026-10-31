'use strict';
/*---------------------------------------------------------------------------------------------
 * @vscode/native-watchdog 公开 API 验证 suite（基线/候选共用，四目标共用）。
 *
 * 公开 API 面（index.d.ts，npm 发布包 9 文件之一）：
 *   - start(pid: number): void   监控 pid；该进程终止后当前进程约 6s 内以退出码 87 退出
 *   - exit(exitCode: number): void  立即以指定退出码终止当前进程
 * 上游 test/test.js（fork reference_child + bad_child 的集成测试）不在 npm 发布包内，
 * 用例 1 以 -e 子进程原样重构其语义（reference 存活 10s 自然退出 → bad_child
 * start(refpid) 后死循环 → 断言 bad_child 以退出码 87 终止），判据与上游一致。
 *
 * 断言口径与本地适配仓 tests-generated/ 必跑名册一致（同一 02 契约）：
 *   1. kill-on-death：被监控进程消失后监控进程以 87 终止（上游集成测试语义）
 *   2. start 契约：start(<合法 pid>) 不抛/返回 undefined/8s 观察窗内不伪退出
 *   3. exit 契约：exit(87)→87、exit(0)→0 立即终止（子进程 8s SIGKILL 兜底 + 三组对照）
 *
 * 装载契约（补丁 0001 后）：
 *   - Electron-OH 主进程（process.versions.electron && platform==='openharmony'）：
 *     addon 部署在应用原生库目录（electron/libs/arm64-v8a），按沙箱绝对路径候选探测
 *   - 纯 node 进程（device-node 宿主 / Electron fork 的 HNP node 子进程）：
 *     包内相对路径 ./build/Release/watchdog.node → 同 bundle 私有 HNP bin 兜底
 *   - Linux/macOS/Windows 行为不变（相对路径）
 *
 * 基线阶段装载失败必须在每条用例内如实报 fail（懒装载 + 逐用例抛错），不得整 suite
 * 无 summary。port 回归默认 require 候选包 '@ohos-ports-electron/vscode-native-watchdog'；
 * 阶段 01 基线段经 NW_LIB_IDENTITY / 装配脚本改回 '@vscode/native-watchdog'。
 *--------------------------------------------------------------------------------------------*/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const LIB_IDENTITY = process.env.NW_LIB_IDENTITY || '@ohos-ports-electron/vscode-native-watchdog';
const PKG_MAIN = require.resolve(LIB_IDENTITY);

// 懒装载：基线（无预编译 addon）装载失败在用例内报 fail 而非 suite 加载期崩溃。
let _nw = null;
let _loadErr = null;
function nw() {
  if (_loadErr) throw _loadErr;
  if (!_nw) {
    try {
      _nw = require(PKG_MAIN);
    } catch (e) {
      _loadErr = e;
      throw e;
    }
  }
  return _nw;
}

// Electron-OH：子进程 node 运行时来自同 bundle 私有 HNP（实体路径枚举；
// ELECTRON_RUN_AS_NODE / resfile / 跨 bundle symlink 三路均不可用，L082）。
const HNP_TOOL = 'ohptnode7de4dbf5ed6es3e';
let hnpNodeBin = null;
function resolveHnpNode() {
  if (!process.versions.electron) return process.execPath; // device-node：runner 即 node
  if (hnpNodeBin) return hnpNodeBin;
  const base = '/data/app/' + HNP_TOOL + '.org';
  let entries = [];
  try {
    entries = fs.readdirSync(base);
  } catch (e) {
    throw new Error('HNP 目录不可读: ' + base + ' (' + String(e) + ')');
  }
  const cands = entries
    .filter((n) => n.startsWith(HNP_TOOL + '_'))
    .map((n) => path.join(base, n, 'bin', HNP_TOOL))
    .filter((p) => {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return true;
      } catch (e) {
        return false;
      }
    });
  if (!cands.length) throw new Error('未找到可执行 HNP node（实体路径枚举失败）: ' + base);
  hnpNodeBin = cands.sort().pop(); // 版本目录取最高
  return hnpNodeBin;
}

function childEnv() {
  const env = Object.assign({}, process.env);
  if (process.versions.electron) {
    const hnpBin = path.dirname(resolveHnpNode());
    env.LD_LIBRARY_PATH = [
      hnpBin,
      '/data/storage/el1/bundle/electron/libs/arm64',
      '/data/storage/el1/bundle/libs/arm64',
      '/data/storage/el1/bundle/electron/libs/arm64-v8a',
      '/data/storage/el1/bundle/libs/arm64-v8a',
    ].join(':');
    env.LD_PRELOAD = path.join(hnpBin, 'libsyscall_fallback.so');
  }
  return env;
}

function childExec() {
  return resolveHnpNode();
}

function runProc(args, opts, guardMs) {
  return new Promise((resolve) => {
    // app 域限制：V8 JIT 无法分配可执行内存——所有子进程统一 --jitless，
    // 与宿主探针/主入口的 execArgv 一致。
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    const child = spawn(childExec(), ['--jitless', '--expose-gc'].concat(args), Object.assign({ stdio: ['ignore', 'pipe', 'pipe'] }, opts));
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => done({ code: null, signal: null, error: String((e && e.message) || e), out }));
    const killer = setTimeout(() => child.kill('SIGKILL'), guardMs || 30000);
    child.on('exit', (code, signal) => {
      clearTimeout(killer);
      done({ code, signal, error: null, out });
    });
  });
}

const _suite = {};

// ---- 用例 1：上游集成测试语义（kill-on-death → 退出码 87）----
// reference 子进程存活 10s 后自然退出（上游 reference_child.js 同款定时）；
// bad 子进程 start(refpid) 后死循环（上游 bad_child.js 同款）。
// 断言 bad 子进程以 87 终止（上游 test/test.js 只断言退出，这里额外核对退出码
// 契约值，index.d.ts: "exits in 6 seconds with exit code 87"）。
_suite['watchdog kills monitor after watched pid dies (upstream test/test.js)'] = async ({ check }) => {
  nw(); // 装载失败 → 用例 fail（基线预期形态）
  // reference 子进程存活 10s 后自然退出（上游 reference_child.js 同款定时）；
  // bad 子进程 start(refpid) 后死循环（上游 bad_child.js 同款）。两者并行存活。
  const refProc = spawn(childExec(), ['--jitless', '-e', 'setTimeout(()=>{},10000);'], { stdio: 'ignore', env: childEnv() });
  const badProc = spawn(childExec(), ['--jitless', '-e',
    `const nw=require(${JSON.stringify(PKG_MAIN)});nw.start(${refProc.pid});while(true){;}`,
  ], { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv() });
  let badOut = '';
  badProc.stdout.on('data', (d) => (badOut += d));
  badProc.stderr.on('data', (d) => (badOut += d));
  const badDone = new Promise((resolve) => {
    const killer = setTimeout(() => badProc.kill('SIGKILL'), 30000);
    badProc.on('exit', (code, signal) => { clearTimeout(killer); resolve({ code, signal }); });
  });
  const refDone = new Promise((resolve) => {
    const killer = setTimeout(() => refProc.kill('SIGKILL'), 30000);
    refProc.on('exit', (code, signal) => { clearTimeout(killer); resolve({ code, signal }); });
  });
  await refDone;
  const refDeadAt = Date.now();
  const bad = await badDone;
  const badExitAt = Date.now();
  check(1, bad.code === 87, JSON.stringify({ code: bad.code, signal: bad.signal, outTail: String(badOut).slice(-300) }), 87);
  check(2, bad.code !== null, bad.code, '非 null（未挂起被 SIGKILL）');
  check(3, refDeadAt <= badExitAt, JSON.stringify({ refDeadAt, badExitAt }), '被监控进程先于监控进程退出');
};

// ---- 用例 2：start(<合法整数 pid>) 契约（F-01-01）----
_suite['start accepts valid integer pid and keeps process alive'] = async ({ check }) => {
  const lib = nw();
  let ret;
  let threw = false;
  let errMsg = '';
  try {
    ret = lib.start(process.pid);
  } catch (e) {
    threw = true;
    errMsg = String((e && e.message) || e);
  }
  check(1, !threw, threw ? 'threw: ' + errMsg : 'no-throw', 'no-throw');
  check(2, ret === undefined, ret, undefined);
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 8000));
  const elapsedMs = Date.now() - t0;
  check(3, elapsedMs >= 7000, 'alive after ' + elapsedMs + 'ms', 'alive after >=7000ms (无 87 误退出)');
};

// ---- 用例 3：exit(code) 立即终止契约（F-02-01）----
_suite['exit terminates immediately with given code'] = async ({ check }) => {
  nw();
  const runExitChild = (codeArg, mode) => {
    // mode: 'addon' = nw.exit(code)（addon 原生 exit）；'process' = process.exit(code)（纯 JS 对照）
    const exitCall = mode === 'process'
      ? `process.exit(${codeArg});`
      : `nw.exit(${codeArg});`;
    const expr =
      `const nw=require(${JSON.stringify(PKG_MAIN)});nw.start(process.pid);${exitCall}`;
    return runProc(['-e', expr], { env: childEnv() }, 8000);
  };
  const r87 = await runExitChild(87, 'addon');
  check(1, r87.code === 87, JSON.stringify({ code: r87.code, signal: r87.signal, out: String(r87.out).slice(-300) }), 87);
  check(2, r87.code !== null, r87.code, '非 null（未挂起被 SIGKILL）');
  const r0 = await runExitChild(0, 'addon');
  check(3, r0.code === 0, JSON.stringify({ code: r0.code, signal: r0.signal, out: String(r0.out).slice(-300) }), 0);
  check(4, r0.code !== null, r0.code, '非 null（未挂起被 SIGKILL）');
  // 诊断对照（区分 addon exit 挂起 vs 环境性挂起）：
  const rP = await runExitChild(87, 'process');
  check(5, rP.code !== null, JSON.stringify({ code: rP.code, signal: rP.signal }), 'process.exit 对照组非 null');
  const rBare = await runProc(['-e', 'process.exit(87);'], { env: childEnv() }, 8000);
  check(6, rBare.code === 87, JSON.stringify({ code: rBare.code, signal: rBare.signal }), '裸 process.exit(87)');
  const rDelay = await runProc(
    ['-e', `const nw=require(${JSON.stringify(PKG_MAIN)});nw.start(process.pid);setTimeout(()=>process.exit(87),800);`],
    { env: childEnv() }, 8000
  );
  check(7, rDelay.code === 87, JSON.stringify({ code: rDelay.code, signal: rDelay.signal }), 'start+delay 800ms exit(87)');
};

module.exports = _suite;
