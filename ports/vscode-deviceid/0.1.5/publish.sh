#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
args=()
if [[ "${ENABLE_ELECTRON_OH_PUBLISH:-0}" != 1 ]]; then
  echo 'Electron-OH publication disabled; prepare and review the frozen release first.'
  exit 0
fi
args+=(--execute)
exec python3 electron-oh/tools/workflow.py publish --release "${ELECTRON_OH_RELEASE_DIR:?Set prepared release directory}" "${args[@]}" "$@"
