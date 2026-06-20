#!/bin/bash
set -euo pipefail

APP_DIR="__INSTALL_DIR__"
NODE_BIN="__NODE_BIN__"
LOG_DIR="${HOME}/Library/Logs/apostoliclife-worship"
NEXT_BIN="$APP_DIR/node_modules/next/dist/bin/next"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

export PATH="$(dirname "$NODE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-127.0.0.1}"

if [[ ! -f "$NEXT_BIN" ]]; then
  echo "Missing Next.js build. Run: npm install && npm run build" >>"$LOG_DIR/micboard.error.log"
  exit 1
fi

exec "$NODE_BIN" "$NEXT_BIN" start -H "$HOSTNAME" -p "$PORT" >>"$LOG_DIR/micboard.log" 2>>"$LOG_DIR/micboard.error.log"