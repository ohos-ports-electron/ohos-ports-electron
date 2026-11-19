#!/usr/bin/env bash
set -euo pipefail
PORT_DIR="$(cd "$(dirname "$0")" && pwd)"
: "${ELECTRON_OH_BUNDLE:?Set the previously built artifact directory}"
if [[ "${ENABLE_ELECTRON_OH_PUBLISH:-0}" != 1 ]]; then
  echo "Publication disabled; verifying only."
  exec python3 "$PORT_DIR/electron-oh/tools/release.py" verify --bundle "$ELECTRON_OH_BUNDLE"
fi
exec python3 "$PORT_DIR/electron-oh/tools/release.py" publish --bundle "$ELECTRON_OH_BUNDLE"
