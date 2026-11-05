#!/usr/bin/env bash
set -euo pipefail
PORT=$(cd "$(dirname "$0")" && pwd)
: "${ENABLE_ELECTRON_OH_PUBLISH:?Publication disabled}"
: "${ELECTRON_OH_BUNDLE:?Frozen bundle required}"
exec python3 "$PORT/electron-oh/tools/release.py" publish --bundle "$ELECTRON_OH_BUNDLE"
