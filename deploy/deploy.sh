#!/usr/bin/env bash
# Deploy MathTime: pull main and publish the game to the folder nginx serves.
#
#   ~/apps/mathtime/deploy/deploy.sh            publish the latest main
#   ~/apps/mathtime/deploy/deploy.sh <commit>   publish an earlier commit (rolling back)
#
# Only index.html and src/ go live; docs, tests and .git stay off the web. The files come from git, not
# the working tree, so a local edit on this machine is never published by accident.
# Stops at the first failure. Until the publish step the old version keeps serving, untouched.

set -euo pipefail
cd "$(dirname "$0")/.."

WEB_ROOT=/var/www/mathtime
SITE_HOST=math.nshanklin.com   # also server_name in deploy/nginx.conf

step() { printf '\n==> %s\n' "$1"; }
fail() { printf '\n!! %s\n' "$1" >&2; exit 1; }

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
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
git archive "$ref" index.html src | tar -x -C "$stage"

step "Publishing to $WEB_ROOT"
# --chmod: mktemp makes the staging folder private, and rsync would copy that mode onto WEB_ROOT,
# leaving nginx unable to read it.
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete --chmod=D755,F644 "$stage"/ "$WEB_ROOT"/

step "Checking the live site"
# Through this machine's own nginx: the home router may not route mainframe back to its own public IP.
# --resolve keeps the real hostname, so TLS and the server block still match.
live() { curl -fsS --max-time 10 --resolve "$SITE_HOST:443:127.0.0.1" "$@"; }
live "https://$SITE_HOST/" | cmp -s - "$stage/index.html" \
  || fail "https://$SITE_HOST/ is not the index.html just published. Check sudo nginx -t and deploy/README.md."
type="$(live -o /dev/null -w '%{content_type}' "https://$SITE_HOST/src/main.js")" \
  || fail "https://$SITE_HOST/src/main.js did not load."
# Browsers refuse to run a module served as anything but JavaScript.
case "$type" in
  application/javascript*|text/javascript*) ;;
  *) fail "src/main.js is served as '$type', so browsers will not run it." ;;
esac

printf '\nDeployed %s: https://%s/\n' "$version" "$SITE_HOST"
