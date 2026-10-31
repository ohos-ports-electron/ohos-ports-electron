#!/usr/bin/env bash
# ports/vscode-native-watchdog/1.4.6 · 从锁定基线 + 锁定原生归档组装候选 tgz。
# 用法：build.sh --native-url <url> [--baseline <tgz>] [--output <dir>] [--verify]
#       build.sh --native-dir <dir> [--baseline <tgz>] [--output <dir>] [--verify]
set -euo pipefail
cd "$(dirname "$0")"
exec node electron-oh/tools/build-candidate.mjs "$@"
