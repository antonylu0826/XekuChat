#!/bin/sh
set -e

# Always set the correct API endpoint before any zrok command
ZROK_ENDPOINT="${ZROK_API_ENDPOINT:-https://api.zrok.io}"
echo "[zrok] API endpoint: $ZROK_ENDPOINT"
zrok config set apiEndpoint "$ZROK_ENDPOINT"

# Auto-enable on first run (no environment.json means not yet enabled)
if [ ! -f /zrok/.zrok/environment.json ]; then
  if [ -z "$ZROK_ENABLE_TOKEN" ]; then
    echo "[zrok] ERROR: ZROK_ENABLE_TOKEN is not set in .env"
    exit 1
  fi
  echo "[zrok] First run — enabling environment..."
  zrok enable "$ZROK_ENABLE_TOKEN"
  echo "[zrok] Environment enabled."
fi

echo "[zrok] Starting tunnel → http://caddy-dev:80"
exec zrok share public --headless http://caddy-dev:80
