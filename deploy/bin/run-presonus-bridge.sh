#!/bin/bash
set -eo pipefail

APP_DIR="/Users/stevetipton/Desktop/apostoliclife-worship"
NODE_BIN="/usr/local/bin/node"
LOG_DIR="/Users/stevetipton/Library/Logs/apostoliclife-worship"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

{
  echo "----- $(date) -----"
  echo "Starting PreSonus bridge"
  echo "APP_DIR=$APP_DIR"
  echo "NODE_BIN=$NODE_BIN"
  echo "USER=${USER:-unknown}"
  echo "HOME=${HOME:-unknown}"
} >>"$LOG_DIR/presonus-bridge.error.log"

export PATH="$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

exec "$NODE_BIN" scripts/presonus-bridge.mjs