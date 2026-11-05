#!/usr/bin/env bash
set -euo pipefail
PORT=$(cd "$(dirname "$0")" && pwd)
exec python3 "$PORT/electron-oh/tools/build.py" --port "$PORT" "$@"
