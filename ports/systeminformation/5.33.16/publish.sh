#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${ENABLE_ELECTRON_OH_PUBLISH:-0}" != 1 ]]; then
  echo 'Electron-OH publication disabled; CI on main must explicitly enable it.'
  exit 0
fi
echo 'Release is BLOCKED for systeminformation 5.33.16-electron-oh.0:'
echo '  - e40 (Electron-OH 40.0.1) full matrix not passed (runtime SIGCHLD/waitpid defect, not library).'
echo '  - npm Trusted Publishing / environment for @ohos-ports-electron not confirmed.'
exit 1
