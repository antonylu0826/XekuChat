#!/bin/sh
set -e

ZROK_CFG="$HOME/.zrok/environment.json"

# Enable zrok environment if not already enrolled
if [ ! -f "$ZROK_CFG" ]; then
  if [ -z "$ZROK_ENABLE_TOKEN" ]; then
    echo "[zrok] ERROR: ZROK_ENABLE_TOKEN is not set."
    echo "[zrok] Get a free token at https://zrok.io and set it in .env"
    exit 1
  fi
  echo "[zrok] Enabling environment with provided token..."
  zrok enable "$ZROK_ENABLE_TOKEN"
fi

echo "[zrok] Starting public share → $ZROK_TARGET"
exec zrok share public --headless "$ZROK_TARGET"
