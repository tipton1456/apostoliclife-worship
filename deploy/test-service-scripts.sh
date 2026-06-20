#!/bin/bash
set -eo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Testing service scripts outside launchd..."
echo "Press Ctrl+C after confirming the app starts."
echo ""

if [[ ! -x "$APP_DIR/deploy/bin/run-micboard.sh" ]]; then
  echo "Generated scripts not found. Run ./deploy/install-services.sh first."
  exit 1
fi

echo "Starting mic board script:"
"$APP_DIR/deploy/bin/run-micboard.sh"