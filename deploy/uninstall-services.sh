#!/bin/bash
set -euo pipefail

LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"

launchctl bootout "gui/${UID}/com.apostoliclife.presonus-bridge" 2>/dev/null || true
launchctl bootout "gui/${UID}/com.apostoliclife.micboard" 2>/dev/null || true

rm -f \
  "$LAUNCH_AGENTS_DIR/com.apostoliclife.presonus-bridge.plist" \
  "$LAUNCH_AGENTS_DIR/com.apostoliclife.micboard.plist"

echo "Background services removed."