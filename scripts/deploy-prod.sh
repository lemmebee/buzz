#!/usr/bin/env bash
# Deploy the buzz PRODUCTION instance (https://buzz.mrg.sh, pm2 "buzz-prod", port 3004).
# Builds the Next.js bundle, syncs the prod DB schema, and reloads the pm2 app.
# Does NOT touch the dev server (npm run dev on port 3003) or its DB (data/buzz.db).
set -euo pipefail

cd "$(dirname "$0")/.."   # project root

# Read prod settings from .env.prod so build + DB sync use the prod values.
export DATABASE_PATH="$(grep -E '^DATABASE_PATH=' .env.prod | cut -d= -f2-)"
export NEXT_DIST_DIR="$(grep -E '^NEXT_DIST_DIR=' .env.prod | cut -d= -f2-)"
echo "==> Deploying buzz-prod (DATABASE_PATH=$DATABASE_PATH, NEXT_DIST_DIR=$NEXT_DIST_DIR)"

echo "==> Building..."
npm run build

echo "==> Syncing prod DB schema..."
npm run db:push

echo "==> Reloading pm2 app..."
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

echo "==> Done. Live at https://buzz.mrg.sh"
