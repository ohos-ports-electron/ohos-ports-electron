#!/usr/bin/env bash
set -euo pipefail
recipe_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$recipe_dir/electron-oh/tools/build-bundle.py" "$@"
