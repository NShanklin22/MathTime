#!/usr/bin/env bash
# Deploy MathTime: pull main, update the API container and publish the game to the folder nginx serves.
#
#   ~/apps/mathtime/deploy/deploy.sh            publish the latest main
#   ~/apps/mathtime/deploy/deploy.sh <commit>   publish an earlier commit (rolling back)
#
# Only index.html and src/ go live; docs, tests and .git stay off the web. The API is built from server/.
# The files come from git, not the working tree, so a local edit on this machine is never published by
# accident. Stops at the first failure. Until the API restarts the old version keeps serving, untouched,
# and the database is backed up before then.

set -euo pipefail
cd "$(dirname "$0")/.."

WEB_ROOT=/var/www/mathtime
SITE_HOST=math.nshanklin.com   # also server_name in deploy/nginx.conf
DATA=data                      # ~/apps/mathtime/data: the API's database, mounted at /data (deploy/compose.yaml)

step() { printf '\n==> %s\n' "$1"; }
fail() { printf '\n!! %s\n' "$1" >&2; exit 1; }
compose() { docker compose -f deploy/compose.yaml "$@"; }
# Through this machine's own nginx: the home router may not route mainframe back to its own public IP.
# --resolve keeps the real hostname, so TLS and the server block still match.
live() { curl -fsS --max-time 10 --resolve "$SITE_HOST:443:127.0.0.1" "$@"; }

step "Pulling main"
before="$(git rev-parse HEAD)"
git pull --ff-only origin main
# The pull can replace this very script, and bash would carry on with a mix of old and new lines.
# Start again as the new version; it finds nothing to pull and carries on from here.
if ! git diff --quiet "$before" HEAD -- deploy/deploy.sh; then
  echo "deploy.sh itself changed; restarting with the new version"
  exec deploy/deploy.sh "$@"
fi

ref="${1:-HEAD}"
version="$(git rev-parse --short "$ref^{commit}")" || fail "No commit '$ref' here. See: git log --oneline"

step "Unpacking $version"
stage="$(mktemp -d)"     # the game, for the web root
build="$(mktemp -d)"     # the API, for docker build; never under the web root
trap 'rm -rf "$stage" "$build"' EXIT
git archive "$ref" index.html src | tar -x -C "$stage"
# The API came with accounts. A commit from before then has no server/, and leaves the running API alone.
api=no
if git cat-file -e "$ref:server" 2>/dev/null; then
  git archive "$ref" server | tar -x -C "$build"
  api=yes
fi

if [ "$api" = yes ]; then
  step "Checking the data folder"
  # The container runs as this user (deploy/.env, read by every docker compose command in deploy/),
  # so the database and its backups stay this user's files. Made here, before docker would make it
  # owned by root.
  mkdir -p "$DATA" || fail "Could not make $PWD/$DATA."
  fix="sudo chown -R $(id -u):$(id -g) $PWD/$DATA, then deploy again."
  { [ -O "$DATA" ] && [ -w "$DATA" ]; } || fail "$PWD/$DATA must belong to $(id -un) and be writable: $fix"
  for f in "$DATA"/mathtime.db*; do
    [ -e "$f" ] || continue
    { [ -O "$f" ] && [ -w "$f" ]; } || fail "$PWD/$f must belong to $(id -un) and be writable: $fix"
  done
  printf 'APP_UID=%s\nAPP_GID=%s\n' "$(id -u)" "$(id -g)" > deploy/.env

  step "Backing up the database"
  # Today's copy in data/backups (deploy/backup.sh), from the image now running, which keeps serving.
  bash deploy/backup.sh

  step "Building the API"
  docker build -t mathtime-api:live "$build/server"

  step "Starting the API"
  compose up -d --no-build --force-recreate api

  step "Daily backup"
  # A cron line for this user, written once; deploy/README.md has it too.
  line="17 3 * * * bash $PWD/deploy/backup.sh >> $PWD/$DATA/backup.log 2>&1   # mathtime-backup"
  if ! command -v crontab >/dev/null; then
    echo "No crontab on this machine: set up the daily backup by hand (deploy/README.md, \"Backups\")"
  elif crontab -l 2>/dev/null | grep -qxF "$line"; then
    echo "Already in crontab"
  else
    { crontab -l 2>/dev/null | grep -v -e '# mathtime-backup$' -e '^$' || true; echo "$line"; } | crontab -
    echo "Added to crontab: $line"
  fi
fi

step "Publishing to $WEB_ROOT"
# --chmod: mktemp makes the staging folder private, and rsync would copy that mode onto WEB_ROOT,
# leaving nginx unable to read it.
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete --chmod=D755,F644 "$stage"/ "$WEB_ROOT"/

step "Checking the live site"
live -o "$stage/live.html" "https://$SITE_HOST/" || {
  code=$?
  # 60: nginx has no server block with a certificate for this name, so it answered with another site's.
  [ "$code" -eq 60 ] && fail "nginx has no valid certificate for $SITE_HOST yet. Do steps 3 and 4 of deploy/README.md (the nginx site, then certbot), then deploy again."
  fail "https://$SITE_HOST/ did not load through this machine's nginx (curl exit $code, above)."
}
cmp -s "$stage/live.html" "$stage/index.html" \
  || fail "https://$SITE_HOST/ answers, but not with the index.html just published. Is root $WEB_ROOT in /etc/nginx/sites-available/mathtime?"
type="$(live -o /dev/null -w '%{content_type}' "https://$SITE_HOST/src/main.js")" \
  || fail "https://$SITE_HOST/src/main.js did not load."
# Browsers refuse to run a module served as anything but JavaScript.
case "$type" in
  application/javascript*|text/javascript*) ;;
  *) fail "src/main.js is served as '$type', so browsers will not run it." ;;
esac

if [ "$api" = yes ]; then
  step "Checking the API"
  # Through nginx too, so this also checks its /api/ block. The container takes a moment to start.
  health=""
  for _ in $(seq 1 20); do
    health="$(live "https://$SITE_HOST/api/healthz" 2>/dev/null)" && [ "$health" = ok ] && break
    sleep 1
  done
  if [ "$health" != ok ]; then
    code="$(live -o /dev/null -w '%{http_code}' "https://$SITE_HOST/api/healthz" 2>/dev/null || true)"
    [ "$code" = 404 ] && fail "https://$SITE_HOST/api/healthz is 404: nginx has no /api/ block yet. Add it (deploy/README.md, \"The API\"), then deploy again."
    fail "https://$SITE_HOST/api/healthz did not answer ok (HTTP ${code:-none}). See: docker compose -f deploy/compose.yaml logs api"
  fi
fi

printf '\nDeployed %s: https://%s/\n' "$version" "$SITE_HOST"
