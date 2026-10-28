# Deploying MathTime

Runs on mainframe next to the other apps, but unlike them it has no server process and no port. The game
is static files (`index.html` and `src/`), so nginx serves them straight from `/var/www/mathtime`, and
`deploy.sh` copies them there from git. The server needs no Node and no Docker.

## First time

1. **DNS.** An A record `math.nshanklin.com` → the home public IP (the same one `cook.nshanklin.com`
   resolves to). Check: `nslookup math.nshanklin.com`.

2. **Clone.**
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

5. **Publish.** The script ends by loading the site through this machine's nginx and checking that it
   serves the version just published.
   ```bash
   ~/apps/mathtime/deploy/deploy.sh
   ```

6. **Play it on a phone over cellular** (Wi-Fi off) at https://math.nshanklin.com/.

For another name, change `server_name` in `nginx.conf` and `SITE_HOST` in `deploy.sh`.

## Upgrading

There is no CI, so run the tests on the PC before pushing (`npm test`, `npx playwright test`). Then on
mainframe:

```bash
~/apps/mathtime/deploy/deploy.sh
```

## Rolling back

Publish an earlier commit. The checkout stays on `main`.

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
