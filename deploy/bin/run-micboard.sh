#!/bin/bash
set -eo pipefail

APP_DIR="/Users/stevetipton/Desktop/apostoliclife-worship"
NODE_BIN="/usr/local/bin/node"
LOG_DIR="/Users/stevetipton/Library/Logs/apostoliclife-worship"
NEXT_BIN="$APP_DIR/node_modules/next/dist/bin/next"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

{
  echo "----- $(date) -----"
  echo "Starting mic board"
  echo "APP_DIR=$APP_DIR"
  echo "NODE_BIN=$NODE_BIN"
  echo "USER=${USER:-unknown}"
  echo "HOME=${HOME:-unknown}"
} >>"$LOG_DIR/micboard.error.log"

export PATH="$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export NODE_ENV="production"
export PORT="3000"

if [[ ! -f "$NEXT_BIN" ]]; then
  echo "Missing Next.js build at $NEXT_BIN" >>"$LOG_DIR/micboard.error.log"
  exit 1
fi

exec "$NODE_BIN" "$NEXT_BIN" start -H 0.0.0.0 -p "$PORT"