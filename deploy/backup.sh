#!/usr/bin/env bash
# Back up MathTime's database: today's copy in ~/apps/mathtime/data/backups, keeping the last 14 days
# (server/backup.mjs). A second run on one day replaces that day's copy.
#
#   bash ~/apps/mathtime/deploy/backup.sh
#
# deploy.sh runs it before updating the API, and installs this cron line to run it every night:
#   17 3 * * * bash ~/apps/mathtime/deploy/backup.sh >> ~/apps/mathtime/data/backup.log 2>&1   # mathtime-backup
#
# It runs in a throwaway container of the image already there, beside the running API, which keeps
# serving. Before the first deploy there is nothing to back up, and that is not an error.

set -euo pipefail
cd "$(dirname "$0")/.."

printf '%s ' "$(date '+%F %T')"
if [ ! -f data/mathtime.db ]; then
  echo "No database yet: nothing to back up"
  exit 0
fi
if ! docker image inspect mathtime-api:live >/dev/null 2>&1; then
  echo "No API image yet: nothing to back up"
  exit 0
fi
docker compose -f deploy/compose.yaml run --rm --no-deps --no-build -T api node backup.mjs /data/backups
