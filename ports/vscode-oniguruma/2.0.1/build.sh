#!/usr/bin/env bash
set -euo pipefail
PORT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$PORT_DIR/electron-oh/tools/build.py" --port "$PORT_DIR" "$@"
