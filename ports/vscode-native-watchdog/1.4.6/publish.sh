#!/usr/bin/env bash
# ports/vscode-native-watchdog/1.4.6 · 发布（默认禁发）。
# 仅上传 build 工作流交接的同一冻结 tgz（manifest + candidate.tgz），绝不重新 pack。
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${ENABLE_ELECTRON_OH_PUBLISH:-0}" != 1 ]]; then
  echo 'Electron-OH publication disabled; CI on main must explicitly enable it.'
  exit 0
fi
exec node electron-oh/tools/release.cjs --bundle "${ELECTRON_OH_BUNDLE:?ELECTRON_OH_BUNDLE is required}" --execute
