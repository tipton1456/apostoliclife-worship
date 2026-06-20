#!/bin/bash
set -euo pipefail

APP_DIR="__INSTALL_DIR__"
NODE_BIN="__NODE_BIN__"
LOG_DIR="${HOME}/Library/Logs/apostoliclife-worship"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

exec "$NODE_BIN" scripts/presonus-bridge.mjs >>"$LOG_DIR/presonus-bridge.log" 2>>"$LOG_DIR/presonus-bridge.error.log"