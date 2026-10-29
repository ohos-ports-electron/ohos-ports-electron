#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${ENABLE_ELECTRON_OH_PUBLISH:-0}" != 1 ]]; then
  echo 'Electron-OH publication disabled; CI on main must explicitly enable it.'
  exit 0
fi
exec python3 electron-oh/tools/release.py --bundle "${ELECTRON_OH_BUNDLE:?ELECTRON_OH_BUNDLE is required}" --execute
