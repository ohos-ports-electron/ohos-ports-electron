#!/usr/bin/env bash
set -euo pipefail
PORT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ "${ENABLE_ELECTRON_OH_PUBLISH:-0}" != 1 ]]; then
  echo 'Publication disabled. The trusted main push workflow must explicitly enable it.' >&2
  exit 1
fi
exec python3 "$PORT_DIR/electron-oh/tools/release.py" publish \
  --bundle "${ELECTRON_OH_BUNDLE:?Set the verified build artifact directory}" \
  --mode "${NPM_PUBLISH_MODE:-oidc}" "$@"
