#!/usr/bin/env bash
set -euo pipefail
PORT_DIR="$(cd "$(dirname "$0")" && pwd)"
: "${ELECTRON_OH_BUNDLE:?Set the existing frozen build bundle path}"
exec python3 "$PORT_DIR/electron-oh/tools/release.py" publish --bundle "$ELECTRON_OH_BUNDLE"
