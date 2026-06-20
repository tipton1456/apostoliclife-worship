#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Install Node.js 22 or newer from https://nodejs.org/ and run this script again."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if (( NODE_MAJOR < 20 )); then
  echo "Node.js 20+ is required. Current version: $(node --version)"
  exit 1
fi

if [[ ! -f ".env.local" ]]; then
  if [[ -f ".env.example" ]]; then
    cp ".env.example" ".env.local"
    echo "Created .env.local from .env.example."
    echo "Edit .env.local with your Planning Center and PreSonus settings before continuing."
    exit 1
  fi

  echo "Missing .env.local"
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Building production app..."
npm run build

echo "Installing background services..."
bash "$APP_DIR/deploy/install-services.sh"

echo ""
echo "Deployment complete."
echo "Open http://localhost:3000 on this computer."
echo "Bridge health check: http://localhost:4310/health"