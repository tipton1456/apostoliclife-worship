#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${HOME}/Library/Logs/apostoliclife-worship"

echo "Mic Board Diagnostics"
echo "====================="
echo ""
echo "App directory: $APP_DIR"
echo ""

check() {
  if [[ "$1" == "ok" ]]; then
    echo "[OK] $2"
  else
    echo "[FAIL] $2"
  fi
}

if command -v node >/dev/null 2>&1; then
  check ok "Node.js installed: $(node --version) at $(command -v node)"
else
  check fail "Node.js is not installed"
fi

if [[ -f "$APP_DIR/.env.local" ]]; then
  check ok ".env.local exists"
else
  check fail ".env.local is missing"
fi

if [[ -d "$APP_DIR/.next" ]]; then
  check ok "Production build exists (.next)"
else
  check fail "Production build missing. Run: npm run build"
fi

if [[ -f "$APP_DIR/node_modules/next/dist/bin/next" ]]; then
  check ok "Next.js runtime exists"
else
  check fail "Dependencies missing. Run: npm install"
fi

echo ""
echo "Service status:"
for service in com.apostoliclife.micboard com.apostoliclife.presonus-bridge; do
  if launchctl print "gui/${UID}/$service" >/dev/null 2>&1; then
    state="$(launchctl print "gui/${UID}/$service" | awk -F'= ' '/state =/{print $2; exit}')"
    check ok "$service is loaded ($state)"
  else
    check fail "$service is not loaded"
  fi
done

echo ""
echo "Port checks:"
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  check ok "Something is listening on port 3000"
  lsof -nP -iTCP:3000 -sTCP:LISTEN
else
  check fail "Nothing is listening on port 3000"
fi

if lsof -nP -iTCP:4310 -sTCP:LISTEN >/dev/null 2>&1; then
  check ok "Something is listening on port 4310"
else
  check fail "Nothing is listening on port 4310 (expected if mixer is off and bridge failed)"
fi

echo ""
echo "HTTP checks:"
if curl -fsS --max-time 3 http://127.0.0.1:3000 >/dev/null 2>&1; then
  check ok "Mic board responds at http://127.0.0.1:3000"
else
  check fail "Mic board does not respond at http://127.0.0.1:3000"
fi

if curl -fsS --max-time 3 http://127.0.0.1:4310/health >/dev/null 2>&1; then
  check ok "PreSonus bridge responds at http://127.0.0.1:4310/health"
else
  check fail "PreSonus bridge does not respond (this is normal if the mixer is off)"
fi

echo ""
echo "Recent mic board errors:"
for log in \
  "$LOG_DIR/micboard.launchd.error.log" \
  "$LOG_DIR/micboard.error.log"; do
  if [[ -f "$log" ]]; then
    echo "--- $log ---"
    tail -n 15 "$log"
  fi
done

echo ""
echo "Recent bridge errors:"
for log in \
  "$LOG_DIR/presonus-bridge.launchd.error.log" \
  "$LOG_DIR/presonus-bridge.error.log"; do
  if [[ -f "$log" ]]; then
    echo "--- $log ---"
    tail -n 15 "$log"
  fi
done

if [[ -x "$APP_DIR/deploy/bin/run-micboard.sh" ]]; then
  check ok "Generated mic board service script exists"
else
  check fail "Generated service scripts missing. Run ./deploy/install-services.sh"
fi

echo ""
echo "If port 3000 is not listening, try a manual start:"
echo "  cd \"$APP_DIR\""
echo "  npm run start"
echo ""
echo "If manual start works, reinstall services:"
echo "  ./deploy/install-services.sh"