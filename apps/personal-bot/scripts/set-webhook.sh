#!/usr/bin/env bash
# Set the Telegram webhook for the personal bot.
# Reads TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_SECRET and WORKER_URL from ../.dev.vars
# (local file, gitignored) and passes them as parameters — no token is typed
# into the command. Respects http_proxy/https_proxy for WSL setups.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .dev.vars ]; then
  echo "Missing .dev.vars — create it from .dev.vars.example first (see INSTALL.md)." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.dev.vars
set +a

: "${TELEGRAM_TOKEN:?TELEGRAM_TOKEN not set in .dev.vars}"
: "${TELEGRAM_WEBHOOK_SECRET:?TELEGRAM_WEBHOOK_SECRET not set in .dev.vars}"
: "${WORKER_URL:?WORKER_URL not set in .dev.vars}"

curl -s "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook" \
  -d "url=${WORKER_URL}/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
echo
