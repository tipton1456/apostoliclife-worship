#!/bin/bash
set -eo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$APP_DIR/deploy"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/apostoliclife-worship"

resolve_node() {
  if [[ -n "${NODE_BIN:-}" && -x "$NODE_BIN" ]]; then
    echo "$NODE_BIN"
    return
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi

  for candidate in \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    "$HOME/.nvm/current/bin/node"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done

  return 1
}

NODE_BIN="$(resolve_node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js is required. Install Node 22+ first."
  exit 1
fi

NODE_DIR="$(dirname "$NODE_BIN")"
SERVICE_PATH="${NODE_DIR}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

if [[ "$APP_DIR" == "$HOME/Desktop/"* ]]; then
  echo "ERROR: macOS will not reliably run background services from the Desktop."
  echo "Move the project off Desktop first, for example:"
  echo "  mv \"$APP_DIR\" \"$HOME/apostoliclife-worship\""
  echo "  cd \"$HOME/apostoliclife-worship\""
  echo "  ./deploy/install-services.sh"
  exit 1
fi

if [[ ! -f "$APP_DIR/.env.local" ]]; then
  echo "Missing $APP_DIR/.env.local"
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
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  "$DEPLOY_DIR/run-presonus-bridge.sh" >"$RUN_BRIDGE_SCRIPT"

sed \
  -e "s|__INSTALL_DIR__|$APP_DIR|g" \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  "$DEPLOY_DIR/run-micboard.sh" >"$RUN_MICBOARD_SCRIPT"

chmod +x "$RUN_BRIDGE_SCRIPT" "$RUN_MICBOARD_SCRIPT"
xattr -cr "$RUN_BRIDGE_SCRIPT" "$RUN_MICBOARD_SCRIPT" 2>/dev/null || true

write_plist() {
  local template="$1"
  local output="$2"

  sed \
    -e "s|__INSTALL_DIR__|$APP_DIR|g" \
    -e "s|__HOME__|$HOME|g" \
    -e "s|__USER__|${USER:-$(whoami)}|g" \
    -e "s|__PATH__|$SERVICE_PATH|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    -e "s|__RUN_BRIDGE_SCRIPT__|$RUN_BRIDGE_SCRIPT|g" \
    -e "s|__RUN_MICBOARD_SCRIPT__|$RUN_MICBOARD_SCRIPT|g" \
    "$template" >"$output"
}

write_plist \
  "$DEPLOY_DIR/com.apostoliclife.presonus-bridge.plist" \
  "$LAUNCH_AGENTS_DIR/com.apostoliclife.presonus-bridge.plist"

write_plist \
  "$DEPLOY_DIR/com.apostoliclife.micboard.plist" \
  "$LAUNCH_AGENTS_DIR/com.apostoliclife.micboard.plist"

launchctl bootout "gui/${UID}/com.apostoliclife.presonus-bridge" 2>/dev/null || true
launchctl bootout "gui/${UID}/com.apostoliclife.micboard" 2>/dev/null || true

launchctl bootstrap "gui/${UID}" "$LAUNCH_AGENTS_DIR/com.apostoliclife.presonus-bridge.plist"
launchctl bootstrap "gui/${UID}" "$LAUNCH_AGENTS_DIR/com.apostoliclife.micboard.plist"

launchctl enable "gui/${UID}/com.apostoliclife.presonus-bridge" 2>/dev/null || true
launchctl enable "gui/${UID}/com.apostoliclife.micboard" 2>/dev/null || true

launchctl kickstart -k "gui/${UID}/com.apostoliclife.presonus-bridge" 2>/dev/null || true
launchctl kickstart -k "gui/${UID}/com.apostoliclife.micboard" 2>/dev/null || true

sleep 2

echo "Background services installed."
echo "Node: $NODE_BIN"
echo "App:  $APP_DIR"
echo "Mic board: http://localhost:3000"
echo "Bridge:    http://localhost:4310/health"
echo "Logs:      $LOG_DIR"
echo ""
echo "Run ./deploy/diagnose.sh to verify."