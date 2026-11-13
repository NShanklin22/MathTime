# Deploying MathTime

Runs on mainframe next to the other apps. The game is static files (`index.html` and `src/`), so nginx
serves them straight from `/var/www/mathtime`, and `deploy.sh` copies them there from git. Accounts, runs
and best times are a small API (`server/`): Node in Docker on `127.0.0.1:3006`, with its SQLite database
in `~/apps/mathtime/data`. nginx passes `/api/` to it. `deploy.sh` builds and restarts it, after backing up
the database.

## First time

1. **DNS.** An A record `math.nshanklin.com` → the home public IP (the same one `cook.nshanklin.com`
   resolves to). Check: `nslookup math.nshanklin.com`.

2. **Clone.** Docker must work for this user without sudo (`docker ps`), as for the other apps.
   Port 3006 must be free: `ss -ltn | grep 3006` prints nothing.
   ```bash
   mkdir -p ~/apps && cd ~/apps
   git clone https://github.com/NShanklin22/MathTime.git mathtime
   ```

3. **nginx.**
   ```bash
   cd ~/apps/mathtime
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/mathtime
   sudo ln -s /etc/nginx/sites-available/mathtime /etc/nginx/sites-enabled/mathtime
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. **TLS.**
   ```bash
   sudo certbot --nginx -d math.nshanklin.com
   ```

5. **Publish.** The script builds and starts the API, then ends by loading the site and `/api/healthz`
   through this machine's nginx and checking that it serves the version just published.
   ```bash
   ~/apps/mathtime/deploy/deploy.sh
   ```

6. **Make your own account.** Make an invite (below), then on the game: Log in › Have an invite? Sign up.

7. **Play it on a phone over cellular** (Wi-Fi off) at https://math.nshanklin.com/.

For another name, change `server_name` in `nginx.conf` and `SITE_HOST` in `deploy.sh`.

## The API

Already deployed before accounts? `/etc/nginx/sites-available/mathtime` there has certbot's TLS lines, so
don't copy `nginx.conf` over it. Paste its `location /api/ { ... }` block into the `server` block that
has `listen 443`, next to `location /`, then:

```bash
sudo nginx -t && sudo systemctl reload nginx
~/apps/mathtime/deploy/deploy.sh
```

The container is `deploy/compose.yaml`. Only `deploy.sh` builds, starts or recreates it: it first checks
that `~/apps/mathtime/data` is yours and writable, and writes `deploy/.env`, which makes the container run
as you. Before that file exists, `docker compose` in `deploy/` stops with "run deploy/deploy.sh". Once it
does, from `~/apps/mathtime/deploy`:

```bash
docker compose ps                 # running, and (healthy)
docker compose logs -f api        # its log
docker compose restart api
```

If `deploy.sh` stops because `data` isn't yours (say docker made it, as root), it prints the `chown` that
fixes it.

## Backups

The database is `~/apps/mathtime/data/mathtime.db`. `deploy/backup.sh` copies it to
`data/backups/mathtime-<date>.db`, one copy a day, and deletes copies more than 14 days old. A second run
on the same day replaces that day's copy. It runs before every deploy, and every night at 03:17 from your
crontab, which `deploy.sh` sets up. Its log is `data/backup.log`. Check the line is there:

```bash
crontab -l | grep mathtime-backup
```

If this machine has no `crontab`, `deploy.sh` says so. Add the line by hand (`crontab -e`) once there is one:

```
17 3 * * * bash /home/<you>/apps/mathtime/deploy/backup.sh >> /home/<you>/apps/mathtime/data/backup.log 2>&1   # mathtime-backup
```

To go back to a copy: `docker compose stop api` in `deploy/`, copy it over `mathtime.db`, delete
`mathtime.db-wal` and `mathtime.db-shm`, then `docker compose start api`.

## Invites and passwords

Sign-up is by invite only, and there is no email: both are done on mainframe, from
`~/apps/mathtime/deploy`.

**An invite.** Prints a code like `MATH-7KQ2-XW4P`. It makes one account, and lasts 14 days.

```bash
docker compose exec api node cli.mjs invite
```

**A forgotten password.** Prints a one-time code for that account. The player signs up with it, their
name as it is, and a new password. That sets the password, keeps their times, and logs them out
everywhere else. It too lasts 14 days.

```bash
docker compose exec api node cli.mjs reset <name>
```

**Who has an account:**

```bash
docker compose exec api node cli.mjs users
```

## Trying the API on the PC

```bash
cd server && COOKIE_INSECURE=1 TRUST_PROXY=1 DB_PATH=data/dev.db node server.mjs   # the API on 127.0.0.1:3006
API_URL=http://127.0.0.1:3006 npm start                    # the game on :5480, passing /api/ to it
cd server && DB_PATH=data/dev.db node cli.mjs invite       # an invite for it
```

`COOKIE_INSECURE=1` is for plain http on the PC only, never on mainframe. `TRUST_PROXY=1` takes each
caller's address from `X-Real-IP`, which `npm start` sets as nginx does; set it only when the API is
reachable through such a proxy alone. Its tests: `npm run test:server`.

## Upgrading

There is no CI, so run the tests on the PC before pushing (`npm test`, `npm run test:server`,
`npx playwright test`). Then on mainframe:

```bash
~/apps/mathtime/deploy/deploy.sh
```

## Rolling back

Publish an earlier commit. The checkout stays on `main`. The API goes back too (a commit from before
accounts leaves it as it is). The database stays: a backup is only restored by hand (Backups, above).

```bash
cd ~/apps/mathtime && git log --oneline -5
~/apps/mathtime/deploy/deploy.sh <commit>
```

Then fix forward on `main` and deploy again.

## GitHub Pages

The game is also on GitHub Pages (https://nshanklin22.github.io/MathTime/), rebuilt on every push. To make
mainframe the only copy, turn Pages off from the PC:

```bash
gh api -X DELETE repos/NShanklin22/MathTime/pages
```
