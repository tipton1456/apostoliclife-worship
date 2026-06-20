#!/bin/bash
set -eo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

bash "$APP_DIR/deploy/install-services.sh"