#!/bin/sh
set -eu
OPEN_PORT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ "${1:-}" = "--output" ]; then shift; fi
exec python3 "$OPEN_PORT_DIR/electron-oh/tools/build.py" --port "$OPEN_PORT_DIR" --output "${1:?output directory required}"
