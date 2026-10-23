#!/usr/bin/env bash
# Check an immutable release directory; upload to npm staging only when enabled.
set -euo pipefail
ELECTRON_DIR="$(cd "$(dirname "$0")" && pwd)"
: "${ELECTRON_OH_RELEASE_DIR:?Set to a prepared stage-2 release directory}"
if [[ "${ENABLE_ELECTRON_OH_STAGE:-0}" == 1 ]]; then
  exec "${PYTHON:-python3}" "$ELECTRON_DIR/pipeline/release.py" stage --release "$ELECTRON_OH_RELEASE_DIR" --execute
fi
exec "${PYTHON:-python3}" "$ELECTRON_DIR/pipeline/release.py" stage --release "$ELECTRON_OH_RELEASE_DIR"
