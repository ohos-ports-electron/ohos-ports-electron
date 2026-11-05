#!/bin/sh
set -eu
PORT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$PORT_DIR/electron-oh/tools/release.py" publish --bundle "${ELECTRON_OH_BUNDLE:?bundle required}"
