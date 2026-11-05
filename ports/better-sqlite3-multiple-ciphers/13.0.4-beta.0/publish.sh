#!/usr/bin/env bash
set -euo pipefail
# Guarded publication: main-push-only, npm-publish environment, exact workflow.
PORT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$PORT_DIR/electron-oh/tools/release.py" publish --bundle "$ELECTRON_OH_BUNDLE"
