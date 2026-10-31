#!/usr/bin/env node
'use strict';
/*---------------------------------------------------------------------------------------------
 * @ohos-ports-electron/vscode-native-watchdog 安装入口（分发补丁 0002 生成）
 *
 * - openharmony / ohos：包内自带预编译 addon（build/Release/watchdog.node = device-node
 *   ABI，electron-oh/watchdog.node = Electron-OH 主进程 ABI），无需编译，直接可用。
 *   Electron-OH 40 宿主自报 platform='ohos'（37/34 为 'openharmony'），两种串都按预编译直用处理。
 * - 其他平台：委托 node-gyp rebuild —— 与上游包（binding.gyp 自动触发 node-gyp rebuild）
 *   的有效安装语义完全一致；显式 install 脚本的存在会抑制 npm 的 gypfile 自动检测，
 *   故必须在此显式转交，保持 Linux/macOS/Windows 行为不变。
 *--------------------------------------------------------------------------------------------*/
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform === 'openharmony' || process.platform === 'ohos') {
  const prebuilt = path.join(__dirname, '..', 'build', 'Release', 'watchdog.node');
  if (fs.existsSync(prebuilt)) {
    console.log('[vscode-native-watchdog] openharmony prebuilt addon present, skipping node-gyp rebuild');
    process.exit(0);
  }
  console.error('[vscode-native-watchdog] openharmony prebuilt addon missing: ' + prebuilt);
  process.exit(1);
}

const r = spawnSync('node-gyp', ['rebuild'], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status === null ? 1 : r.status);
