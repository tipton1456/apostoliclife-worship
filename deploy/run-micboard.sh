#!/bin/bash
set -euo pipefail

APP_DIR="__INSTALL_DIR__"
NODE_BIN="__NODE_BIN__"
NPM_BIN="__NPM_BIN__"
LOG_DIR="${HOME}/Library/Logs/apostoliclife-worship"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

export PORT="${PORT:-3000}"

exec "$NPM_BIN" run start >>"$LOG_DIR/micboard.log" 2>>"$LOG_DIR/micboard.error.log"