#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$APP_DIR/deploy"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/apostoliclife-worship"
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"

if [[ -z "$NODE_BIN" || -z "$NPM_BIN" ]]; then
  echo "Node.js and npm are required. Install Node 22+ first."
  exit 1
fi

if [[ ! -f "$APP_DIR/.env.local" ]]; then
  echo "Missing $APP_DIR/.env.local"
  echo "Copy .env.example to .env.local and fill in your values first."
  exit 1
fi

if [[ ! -d "$APP_DIR/.next" ]]; then
  echo "Missing production build. Run: npm run build"
  exit 1
fi

mkdir -p "$LOG_DIR" "$LAUNCH_AGENTS_DIR" "$APP_DIR/deploy/bin"

RUN_BRIDGE_SCRIPT="$APP_DIR/deploy/bin/run-presonus-bridge.sh"
RUN_MICBOARD_SCRIPT="$APP_DIR/deploy/bin/run-micboard.sh"

sed \
  -e "s|__INSTALL_DIR__|$APP_DIR|g" \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  "$DEPLOY_DIR/run-presonus-bridge.sh" >"$RUN_BRIDGE_SCRIPT"

sed \
  -e "s|__INSTALL_DIR__|$APP_DIR|g" \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  -e "s|__NPM_BIN__|$NPM_BIN|g" \
  "$DEPLOY_DIR/run-micboard.sh" >"$RUN_MICBOARD_SCRIPT"

chmod +x "$RUN_BRIDGE_SCRIPT" "$RUN_MICBOARD_SCRIPT"

sed \
  -e "s|__INSTALL_DIR__|$APP_DIR|g" \
  -e "s|__RUN_BRIDGE_SCRIPT__|$RUN_BRIDGE_SCRIPT|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  "$DEPLOY_DIR/com.apostoliclife.presonus-bridge.plist" >"$LAUNCH_AGENTS_DIR/com.apostoliclife.presonus-bridge.plist"

sed \
  -e "s|__INSTALL_DIR__|$APP_DIR|g" \
  -e "s|__RUN_MICBOARD_SCRIPT__|$RUN_MICBOARD_SCRIPT|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  "$DEPLOY_DIR/com.apostoliclife.micboard.plist" >"$LAUNCH_AGENTS_DIR/com.apostoliclife.micboard.plist"

launchctl bootout "gui/${UID}/com.apostoliclife.presonus-bridge" 2>/dev/null || true
launchctl bootout "gui/${UID}/com.apostoliclife.micboard" 2>/dev/null || true

launchctl bootstrap "gui/${UID}" "$LAUNCH_AGENTS_DIR/com.apostoliclife.presonus-bridge.plist"
launchctl bootstrap "gui/${UID}" "$LAUNCH_AGENTS_DIR/com.apostoliclife.micboard.plist"

launchctl enable "gui/${UID}/com.apostoliclife.presonus-bridge"
launchctl enable "gui/${UID}/com.apostoliclife.micboard"

echo "Background services installed."
echo "Mic board: http://localhost:3000"
echo "PreSonus bridge: http://localhost:4310/health"
echo "Logs: $LOG_DIR"