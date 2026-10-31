'use strict';
/*---------------------------------------------------------------------------------------------
 * node-native-watchdog@1.4.6 双宿主 addon 可复现构建脚本
 *
 * 用法：node build/scripts/build-addon.cjs [--node|--electron|--all]
 *
 * 产物：
 *   dist/lib/node/watchdog.node     —— device-node 宿主（napi_ 与 uv_ 符号留 UND，
 *                                      由随私有 HNP 自带的 Node 24.13.0 二进制在 dlopen 时解析）
 *   dist/lib/electron/watchdog.node —— electron-oh 宿主（链 libshim.a + uv_thread_create
 *                                      补充转发，无 napi_/uv_ 未定义符号）
 *
 * 工具链：DevEco NDK clang++（直接调用 llvm/bin/clang++.exe；SDK 路径含空格，
 * 官方 aarch64-linux-ohos-clang 封装脚本 exec 未引号 $SOURCE 会断裂——直调不受影响，
 * 00-env.json ndk.note 已记录）。
 *--------------------------------------------------------------------------------------------*/
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WS = path.resolve(__dirname, '..', '..');
const SRC = path.join(WS, 'source');
const DIST = path.join(WS, 'dist', 'lib');
const BUILD = path.join(WS, 'build');

const NDK = process.env.DEVECO_SDK_HOME
  ? path.join(process.env.DEVECO_SDK_HOME, 'default', 'openharmony', 'native')
  : 'C:\\Program Files\\Huawei\\DevEco Studio\\sdk\\default\\openharmony\\native';
const CLANG = path.join(NDK, 'llvm', 'bin', process.platform === 'win32' ? 'clang++.exe' : 'clang++');
const CLANG_C = path.join(NDK, 'llvm', 'bin', process.platform === 'win32' ? 'clang.exe' : 'clang');
const SYSROOT = path.join(NDK, 'sysroot');

// device-node 目标 Node 头（node-v24.13.0-headers，与随包 Node 24.13.0 同版）
const NODE_INC = path.join(WS, 'deps', 'node-v24.13.0', 'include', 'node');
// electron-oh 目标头与垫片（ohpt-agent env 探测的 electron_toolchain）
const EL_INC = process.env.ELECTRON_NAPI_LIBRARY
  ? path.join(process.env.ELECTRON_NAPI_LIBRARY, 'include', 'electron_node', 'src')
  : path.join('C:\\ohpt-runtime', '37.2.0', 'headers', 'electron-napi-library', 'include', 'electron_node', 'src');
const EL_UV_INC = process.env.ELECTRON_NAPI_LIBRARY
  ? path.join(process.env.ELECTRON_NAPI_LIBRARY, 'include', 'electron_node', 'deps', 'uv', 'include')
  : path.join('C:\\ohpt-runtime', '37.2.0', 'headers', 'electron-napi-library', 'include', 'electron_node', 'deps', 'uv', 'include');
const EL_SHIM = process.env.ELECTRON_NAPI_LIBRARY
  ? path.join(process.env.ELECTRON_NAPI_LIBRARY, 'lib', 'libshim.a')
  : path.join('C:\\ohpt-runtime', '37.2.0', 'headers', 'electron-napi-library', 'lib', 'libshim.a');

const COMMON = [
  '--target=aarch64-linux-ohos',
  '--sysroot=' + SYSROOT,
  '-D__MUSL__',
  '-DNAPI_VERSION=8',
  '-O2',
  '-fstack-protector-strong',
  '-fPIC',
  '-shared',
  '-std=c++17',
];

function run(args, note, driver) {
  const exe = driver || CLANG;
  console.log('\n$ ' + exe + ' ' + args.join(' '));
  const r = spawnSync(exe, args, { encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  if (r.error || r.status !== 0) {
    throw new Error('编译失败 (' + note + '): ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + (r.stderr || ''));
  }
}

function buildNode() {
  const out = path.join(DIST, 'node', 'watchdog.node');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const args = COMMON.concat([
    '-I' + NODE_INC,
    path.join(SRC, 'src', 'watchdog.cc'),
    '-o', out,
    '-Wl,--code-sign',
  ]);
  run(args, 'device-node');
  console.log('→ ' + out);
}

function buildElectron() {
  const out = path.join(DIST, 'electron', 'watchdog.node');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // uv_thread_create 补充转发：编译为独立目标文件后与 libshim.a 一起链接
  const supplementO = path.join(BUILD, 'electron', 'uv_thread_supplement.o');
  const suppArgs = [
    '--target=aarch64-linux-ohos',
    '--sysroot=' + SYSROOT,
    '-D__MUSL__',
    '-I' + EL_UV_INC,
    '-DHIDE_NAPI_AND_UV',
    '-O2',
    '-fPIC',
    '-std=gnu11',
    '-c',
    path.join(BUILD, 'electron', 'uv_thread_supplement.c'),
    '-o', supplementO,
  ];
  run(suppArgs, 'electron uv-supplement', CLANG_C);
  const args = COMMON.concat([
    '-DHIDE_NAPI_AND_UV',
    '-I' + EL_INC,
    '-I' + EL_UV_INC,
    path.join(SRC, 'src', 'watchdog.cc'),
    supplementO,
    EL_SHIM,
    '-o', out,
    '-Wl,--code-sign',
  ]);
  run(args, 'electron-oh');
  console.log('→ ' + out);
}

const only = process.argv[2] || '--all';
if (only === '--node' || only === '--all') buildNode();
if (only === '--electron' || only === '--all') buildElectron();
console.log('\n完成。');
