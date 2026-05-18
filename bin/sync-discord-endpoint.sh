#!/usr/bin/env bash
# Sync Discord interactions endpoint URL to the current Cloudflare quick-tunnel host.
# Runs after buzz-tunnel.service starts so Discord stops routing to a dead hostname.
set -euo pipefail

REPO_DIR="/home/lemmebee/sources/buzz"
DB="$REPO_DIR/data/buzz.db"
SERVICE="buzz-tunnel.service"
TIMEOUT_URL=120
TIMEOUT_REACH=120

log() { echo "[sync-discord] $*" >&2; }

URL=""
for _ in $(seq 1 "$TIMEOUT_URL"); do
  SINCE=$(systemctl --user show "$SERVICE" -p ActiveEnterTimestamp --value 2>/dev/null || true)
  if [ -n "$SINCE" ]; then
    URL=$(journalctl --user -u "$SERVICE" --since "$SINCE" --no-pager 2>/dev/null \
          | grep -oE 'https://[a-z-]+\.trycloudflare\.com' | tail -1 || true)
  fi
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then
  log "no tunnel URL in journal within ${TIMEOUT_URL}s"
  exit 1
fi
log "tunnel URL: $URL"

INT_URL="$URL/api/discord/interactions"
CODE=000
for _ in $(seq 1 "$TIMEOUT_REACH"); do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$INT_URL" \
         -H 'content-type: application/json' --data '{}' --max-time 5 || echo 000)
  # 401 = endpoint reachable, signature missing (expected for raw probe)
  [ "$CODE" = "401" ] && break
  sleep 2
done
if [ "$CODE" != "401" ]; then
  log "tunnel not reachable through Discord route (last HTTP $CODE)"
  exit 1
fi
log "tunnel routable"

TOKEN=$(node -e "
const Database = require('$REPO_DIR/node_modules/better-sqlite3');
const db = new Database('$DB', { readonly: true });
const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('DISCORD_BOT_TOKEN');
process.stdout.write(row && row.value ? row.value : '');
")
if [ -z "$TOKEN" ]; then
  log "no DISCORD_BOT_TOKEN in settings"
  exit 1
fi

RESP=$(curl -sS -w '\n%{http_code}' -X PATCH 'https://discord.com/api/v10/applications/@me' \
       -H "Authorization: Bot $TOKEN" \
       -H 'Content-Type: application/json' \
       -d "{\"interactions_endpoint_url\":\"$INT_URL\"}")
HTTP=${RESP##*$'\n'}
BODY=${RESP%$'\n'*}
if [ "$HTTP" = "200" ]; then
  log "Discord interactions endpoint updated to $INT_URL"
else
  log "Discord PATCH failed (HTTP $HTTP): $BODY"
  exit 1
fi
