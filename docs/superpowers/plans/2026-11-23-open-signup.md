# Open sign-up and Google sign-in: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone can sign up with a name and password, and with Google, as the spec says (docs/superpowers/specs/2026-11-23-open-signup-design.md).

**Architecture:**
- **Server:** in `server/`, with Node 24, `node:sqlite` and no dependencies, as it is now. Open sign-up is a change to `POST /api/signup`. Google is three new routes plus two tables. The token exchange goes through an injected `fetch`, so tests never reach Google.
- **Client:** the log-in screen (`src/login.js`, `index.html`) gets the hidden code field, the Google button, and a Pick a name mode. `src/main.js` reads `?auth=` on load.

**Tech stack:** plain ES modules, `node:test`, Playwright with the fake API in `tests/e2e/fixtures.js`.

**Branch:** `signup`, in the worktree `.claude/worktrees/signup`. Files use CRLF; keep it.

---

### Task 1: Open sign-up on the server

**Files:**
- Modify: `server/app.mjs` (the signup route, the limits, createApp's options), `server/server.mjs` (the `OPEN_SIGNUP` env).
- Test: `server/test/accounts.test.mjs`.

- [ ] **Step 1: Write the failing tests** in `server/test/accounts.test.mjs`, following its `signup()` helper:

```js
test('sign-up with no invite makes an account', async () => {
  const res = await signup({ name: 'open_1', password: 'password1' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.json, { name: 'open_1' });
});
test('an empty invite counts as none', async () => {
  assert.equal((await signup({ invite: '  ', name: 'open_2', password: 'password1' })).status, 201);
});
test('with OPEN_SIGNUP off, no invite is 403 invite', async () => {
  const closed = await startApi({ openSignup: false });
  const res = await closed.post('/api/signup', { name: 'nope', password: 'password1' });
  assert.equal(res.status, 403);
  assert.deepEqual(res.json, { error: 'invite' });
});
test('a filled honeypot is 400 name and makes nothing', async () => {
  const res = await signup({ name: 'bot_1', password: 'password1', website: 'http://x' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.json, { error: 'name' });
  assert.equal((await login({ name: 'bot_1', password: 'password1' })).status, 401);
});
test('an address makes at most 5 accounts an hour', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await signup({ name: `many_${i}`, password: 'password1' })).status, 201);
  const sixth = await signup({ name: 'many_5', password: 'password1' });
  assert.equal(sixth.status, 429);
  api.advance(60 * 60 * 1000);
  assert.equal((await signup({ name: 'many_5', password: 'password1' })).status, 201);
});
```

  - Use the file's own test-server helpers in place of `startApi`, `login` and `api.advance`, whatever they are called there.
  - If the API has no clock to move on, add a `now` option and use it.
  - The minute limit (10 tries) would otherwise hit first in the "5 an hour" test. Space its sign-ups past a minute with the clock, or give that test a fresh API.

- [ ] **Step 2: Run them and see them fail**

```powershell
npm run test:server
```

  Expected: the new tests fail (403 invite, or 201 for the honeypot).

- [ ] **Step 3: Implement** in `server/app.mjs`:
  - `createApp({ ..., openSignup = true })`.
  - A second limiter with a one-hour window. Generalise the limiter maker to take the window (`RATE_WINDOW` becomes its default argument), and add `export const SIGNUP_HOUR_LIMIT = 5;`.
  - In `'POST /api/signup'`:

```js
const { invite, name, password, website } = body ?? {};
limitAddress(req);
if (website) throw new HttpError(400, { error: 'name' });
// ...the name and password checks as now...
const open = typeof invite !== 'string' || !invite.trim();
if (open && !openSignup) throw new HttpError(403, { error: 'invite' });
const hourKey = `signup:${callerOf(req)}`;
if (open && hourly.full(hourKey, SIGNUP_HOUR_LIMIT)) throw new HttpError(429, { error: 'rate' });
```

  - `check()` keeps its code path for a non-open sign-up. For an open one it only checks `taken`.
  - In the transaction, the open path skips `useCode`.
  - After the user is made: `if (open) hourly.hit(hourKey);`.
  - In `server/server.mjs`: `const openSignup = process.env.OPEN_SIGNUP !== '0';`. Pass it to createApp, document it in the header comment's env list, and add it to the startup notes when it is off.

- [ ] **Step 4: Run all the server tests**

```powershell
npm run test:server
```

  Expected: every test passes, the invite and reset tests included.

- [ ] **Step 5: Commit**

```powershell
git add server; git commit -m "feat(api): open sign-up: no invite needed, a honeypot, 5 accounts an hour an address"
```

### Task 2: Google tables and store functions

**Files:**
- Modify: `server/store.mjs`.
- Test: `server/test/store.test.mjs` (or the store tests' current file).

- [ ] **Step 1: Write the failing tests:**

```js
test('an identity links a provider subject to a user', () => {
  const db = openDb(':memory:');
  const id = store.createUser(db, { name: 'gina', pwHash: '!', now: 1 });
  store.addIdentity(db, { provider: 'google', subject: 's1', userId: id, now: 1 });
  assert.equal(store.userByIdentity(db, 'google', 's1').id, id);
  assert.equal(store.userByIdentity(db, 'google', 's2'), undefined);
});
test('a pending sign-up is found until it expires, and taken once', () => {
  const db = openDb(':memory:');
  store.addPending(db, { tokenHash: 'h', provider: 'google', subject: 's1', expiresAt: 100, now: 0 });
  assert.equal(store.findPending(db, 'h', 99).subject, 's1');
  assert.equal(store.findPending(db, 'h', 100), undefined);
  store.deletePending(db, 'h');
  assert.equal(store.findPending(db, 'h', 0), undefined);
});
test('writing a pending row clears expired ones', () => {
  const db = openDb(':memory:');
  store.addPending(db, { tokenHash: 'old', provider: 'google', subject: 'a', expiresAt: 10, now: 0 });
  store.addPending(db, { tokenHash: 'new', provider: 'google', subject: 'b', expiresAt: 100, now: 50 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pending').get().n, 1);
});
```

- [ ] **Step 2: Run them:** `npm run test:server`. Expected: they fail because `addIdentity` is not a function.

- [ ] **Step 3: Implement.**
  - Add the spec §3's two `CREATE TABLE IF NOT EXISTS` blocks after `daily` in `openDb`.
  - Add the functions:

```js
export const PENDING_LIFE = 15 * 60 * 1000;
export function addIdentity(db, { provider, subject, userId, now }) {
  db.prepare('INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)').run(provider, subject, userId, now);
}
export function userByIdentity(db, provider, subject) {
  return db.prepare('SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?').get(provider, subject);
}
export function addPending(db, { tokenHash, provider, subject, expiresAt, now }) {
  db.prepare('DELETE FROM pending WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO pending (token_hash, provider, subject, expires_at) VALUES (?, ?, ?, ?)').run(tokenHash, provider, subject, expiresAt);
}
export function findPending(db, tokenHash, now) {
  return db.prepare('SELECT * FROM pending WHERE token_hash = ? AND expires_at > ?').get(tokenHash, now);
}
export function deletePending(db, tokenHash) {
  db.prepare('DELETE FROM pending WHERE token_hash = ?').run(tokenHash);
}
```

  - Update the file's header comment: "accounts, sessions, identities, pending sign-ups, invite and reset codes, and runs".

- [ ] **Step 4: Run:** `npm run test:server`. Expected: everything passes.

- [ ] **Step 5: Commit:** `git add server; git commit -m "feat(api): identities and pending sign-ups for Google sign-in"`

### Task 3: Google routes

**Files:**
- Create: `server/google.mjs`, which builds the auth URL, makes PKCE and checks the ID token's claims. These are pure functions.
- Modify: `server/app.mjs` (the routes, and a redirect answer), `server/server.mjs` (the env).
- Test: create `server/test/google.test.mjs`.

- [ ] **Step 1: Write the failing tests:**
  - **`google.mjs` units:**
    - `authUrl({clientId, redirectUri, state, challenge})` has `response_type=code`, `scope=openid`, `code_challenge_method=S256` and `prompt=select_account`.
    - `pkce()` gives a verifier of 43–128 characters, and its challenge is the base64url SHA-256 of the verifier.
    - `checkIdToken(jwt, {clientId, now})` gives the `sub` when `iss` is `https://accounts.google.com` or `accounts.google.com`, `aud` is the client id and `exp*1000 > now`. It throws otherwise. Build the test JWTs by base64url-encoding a header and claims, with any signature.
  - **Routes**, with createApp given `google: {clientId:'cid', clientSecret:'sec', publicUrl:'https://m.test'}` and a stub `fetch` for the token endpoint:
    - `GET /api/config` gives `{google:true}`, and `{google:false}` without the google option.
    - `GET /api/google/start` is a 302 to `accounts.google.com/o/oauth2/v2/auth` with `redirect_uri=https://m.test/api/google/callback`. It sets the cookie `mt_oauth` (HttpOnly; Secure; SameSite=Lax; Path=/api/google; Max-Age=600).
    - Callback with the right state and a known sub: 302 to `/?auth=in`, with `mt_session` set and `mt_oauth` cleared. The stub saw `grant_type=authorization_code`, the code, the secret and `code_verifier`.
    - Callback with a new sub: 302 to `/?auth=name`, with `mt_pending` set (HttpOnly; Secure; SameSite=Lax; Path=/api/google; Max-Age=900).
    - Callback with a wrong state, a missing cookie, `error=access_denied`, a token endpoint answering 400, a wrong `aud`, or an expired token: each is a 302 to `/?auth=failed`, and no session is made.
    - `POST /api/google/name {name:'gina'}` with `mt_pending`: 201 `{name:'gina'}` and a session. Afterwards `/api/me` is gina, logging in by name gets 401 mismatch, and a second callback with the same sub goes to `/?auth=in`.
    - Picking a name: a taken name is 409 taken and keeps the pending row; no cookie or an expired one is 401 `{error:'google'}`; a bad name is 400 name.
    - Without the google option, `/api/google/start` is 404.

- [ ] **Step 2: Run:** `npm run test:server`. Expected: fails, because the module and routes don't exist yet.

- [ ] **Step 3: Implement.**
  - **`server/google.mjs`:**

```js
import { randomBytes, createHash } from 'node:crypto';
const b64u = buf => Buffer.from(buf).toString('base64url');
export const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN = 'https://oauth2.googleapis.com/token';
export function pkce() {
  const verifier = b64u(randomBytes(32));
  return { verifier, challenge: b64u(createHash('sha256').update(verifier).digest()) };
}
export function authUrl({ clientId, redirectUri, state, challenge }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid',
    state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' });
  return `${AUTH}?${q}`;
}
// The ID token came straight from Google's token endpoint over TLS, so its claims are
// checked and its signature is not (OIDC Core 3.1.3.7, item 6).
export function checkIdToken(jwt, { clientId, now }) {
  const claims = JSON.parse(Buffer.from(String(jwt).split('.')[1] ?? '', 'base64url').toString());
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) throw new Error('iss');
  if (claims.aud !== clientId) throw new Error('aud');
  if (!(claims.exp * 1000 > now)) throw new Error('exp');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('sub');
  return claims.sub;
}
```

  - **In `app.mjs`:**
    - `createApp({ ..., google = null, fetch = globalThis.fetch })`.
    - The route handlers may return `[302, null, { Location }]`. Extend the responder so a third element sets headers. `res.setHeader('Set-Cookie', ...)` is called more than once here, so collect the cookies in an array and set them once. Check how `cookie()` sets the header now, and change it to append.
    - A helper `cookieFor(name, value, { path, maxAge })`, built like `cookie()`, with Secure following `cookieSecure`.
    - **Routes:**
      - `GET /api/config`: `[200, { google: !!google }]`.
      - `GET /api/google/start`: 404 when there is no `google`. Otherwise make `state = newToken()` and `{verifier, challenge} = pkce()`. Set `mt_oauth=${state}.${verifier}`, with Path=/api/google and Max-Age=600, and answer 302 to `authUrl(...)`.
      - `GET /api/google/callback`:
        - Count it with `limitAddress(req)`.
        - Read `code`, `state` and `error` from the query, and `mt_oauth` from the cookie. Always clear `mt_oauth`.
        - If anything is missing or mismatched, answer 302 `/?auth=failed`.
        - Otherwise `POST` to `TOKEN` with `fetch`, a form-encoded body (`code, client_id, client_secret, redirect_uri, grant_type=authorization_code, code_verifier`) and a 10-second `AbortSignal.timeout`. Anything but an ok JSON reply with `id_token` is a failure.
        - Get `sub` with `checkIdToken`.
        - If `store.userByIdentity(db, 'google', sub)` finds the account, start the session and answer 302 `/?auth=in`.
        - Otherwise make a pending token: `addPending({tokenHash: hashToken(t), provider: 'google', subject: sub, expiresAt: now()+PENDING_LIFE, now: now()})`. Set the cookie `mt_pending=t` (Path=/api/google, Max-Age=900) and answer 302 `/?auth=name`.
        - Wrap the whole callback in try/catch: any throw is a 302 `/?auth=failed`. Log the error message, never the code or the tokens.
      - `POST /api/google/name`:
        - Count it with `limitAddress`, and check the name as signup does.
        - Find the pending row by the cookie; with none, 401 `{error:'google'}`.
        - In `store.transaction`: re-find the pending row; if the name is taken, 409; `createUser({name, pwHash: '!', now})`; `addIdentity`; `deletePending`.
        - Clear `mt_pending`, start the session, and answer `[201, { name }]`.
    - The routes table matches by `METHOD path`. Check that the router ignores the query string for the GET callback; if not, strip it there.
  - **`server.mjs`:**
    - If `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `PUBLIC_URL` are all set, pass `google: { clientId, clientSecret, publicUrl }` (with no trailing slash on publicUrl).
    - Add them to the env comment.
    - Add a startup note, "Google sign-in on" or "off", and never log the secret.
  - **Hashing:** `pw_hash '!'` must never verify. Check that `verifyPassword(any, '!')` returns false and doesn't throw. If it throws, make it return false for a hash that doesn't parse, and add a test.

- [ ] **Step 4: Run:** `npm run test:server`. Expected: everything passes.

- [ ] **Step 5: Commit:** `git add server; git commit -m "feat(api): Google sign-in: start, callback, pick a name; /api/config"`

### Task 4: Deploy wiring

**Files:**
- Modify: `deploy/compose.yaml`, `.gitignore`, `deploy/README.md`.

- [ ] **Step 1:** In compose's `api` service, add:

```yaml
    env_file:
      - path: secrets.env   # GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_URL (deploy/README.md); not in git
        required: false
```

- [ ] **Step 2:** Add `deploy/secrets.env` to `.gitignore`.
- [ ] **Step 3:** Add a "Google sign-in" section to `deploy/README.md`:
  - the Cloud Console client (Web application) and its redirect URI, `https://math.nshanklin.com/api/google/callback`;
  - `secrets.env` and `chmod 600`;
  - re-running deploy.sh;
  - `OPEN_SIGNUP=0` to close sign-up again.
- [ ] **Step 4:** Check the compose file parses: `docker compose -f deploy/compose.yaml config` if Docker is available locally. Otherwise check that `env_file` with `path`/`required` needs Compose v2.24 or later, and note that in the README.
- [ ] **Step 5: Commit:** `git add deploy .gitignore; git commit -m "deploy: secrets.env for Google sign-in"`

### Task 5: Mockup and UI gate (before any client code)

**Files:**
- Create: `docs/superpowers/specs/2026-11-23-open-signup-mockup.html`, built from `2026-11-09-accounts-mockup.html` and importing /src as that one does.

- [ ] **Step 1:** Draw five states with a state switcher:
  - Log in;
  - Sign up;
  - Sign up with "Have a code?" opened;
  - Pick a name;
  - Log in with the error "Google sign-in didn't work".

  The layout:
  - "or" is a 1px rule each side in the muted line colour. "Continue with Google" is a secondary button, the full field width, with the same height as the submit button. It uses the app's own outline style: no Google logo colours, a plain "G" mark in the text colour.
  - "Have a code?" is the quiet link style of the existing "Have an account?" line.
  - The honeypot `<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true">` sits in a wrapper with `position:absolute; left:-10000px`, never `display:none`, because bots skip hidden fields.
- [ ] **Step 2:** Shoot all 5 states at the 8 gate sizes, with real scrollbars, using `scratchpad/shoot.mjs` as before. Hand them to a fresh UI-review agent with what changed. Fix and re-shoot until it passes. Nothing may scroll at 1366×657.
- [ ] **Step 3: Commit** the mockup.

### Task 6: The client: open sign-up and the code link

**Files:**
- Modify: `index.html` (the form), `src/login.js`, `src/account.js` (send no `invite` when it's empty; send `website`), `src/styles.css`.
- Test: `tests/e2e/accounts.spec.js`, `tests/e2e/fixtures.js` (the fake API takes sign-ups with no invite).

- [ ] **Step 1: Write the failing e2e tests:**
  - Sign up shows Name and Password, with the code field hidden.
  - Sign up with no code: the request body is `{name, password, website: ''}` with no invite, and you land signed in.
  - "Have a code?" shows the Code field focused, and a sign-up then sends the invite.
  - Log in reads "New here? Sign up".
  - The honeypot can't be reached by Tab.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/accounts.spec.js`. Expected: the new tests fail.
- [ ] **Step 3: Implement.**
  - In `index.html`, the invite field becomes "Code" and gets a `code-open` class gate. Add the "Have a code?" button under the submit button, in signup mode only, plus the honeypot.
  - In `login.js`:
    - `codeOpen` starts false on each `open()`;
    - `shown()` leaves out the code field unless it is open;
    - "Have a code?" sets `codeOpen` true, hides itself, shows the field, `place()`s and focuses;
    - the Log in `.ask` text is "New here?".
  - In `account.js`, the sign-up data is `{ name, password, website }`, plus `invite` only when trimmed non-empty.
  - In `ERRORS`, `invite` becomes 'That code doesn't work' if it says "invite" now.
  - Update `checkSignup` callers only as needed.
- [ ] **Step 4:** Run the accounts spec, then the full e2e. Expected: everything passes.
- [ ] **Step 5: Commit:** `git commit -am "feat: open sign-up on the log-in screen: no code needed, Have a code? for invites and resets"`

### Task 7: The client: Google button, Pick a name, `?auth=`

**Files:**
- Modify: `index.html`, `src/login.js` (a `name` mode), `src/account.js` (`config()`, `pickName(name)`, the `google` error), `src/main.js` (read `?auth=` on load), `src/styles.css`.
- Test: create `tests/e2e/google.spec.js`, and extend `tests/e2e/fixtures.js` (`/api/config`, `/api/google/name`).

- [ ] **Step 1: Write the failing e2e tests:**
  - With `{google:false}`, there's no Google button on Log in or Sign up.
  - With `{google:true}`, there is one on both. Clicking it navigates to `/api/google/start`: catch it with `page.route('**/api/google/start', …)` and check the request was made.
  - `/?auth=name` opens Pick a name, with the URL left at `/`. Typing "gina" and Continue sends `POST /api/google/name {name:'gina'}` and gets 201, and Home shows signed in as gina.
  - Pick a name with a 409 shows "That name is taken" on the field. A 401 shows "Google sign-in expired: try again" with a "Continue with Google" button.
  - `/?auth=failed` opens Log in with "Google sign-in didn't work", and the URL is `/`.
  - `/?auth=in` loads `/api/me` and lands on Home signed in, with the URL `/`.
- [ ] **Step 2:** Run them. Expected: they fail.
- [ ] **Step 3: Implement:**
  - **The button:** an `<a class="google" href="/api/google/start">`. It's a real link, so it works with no JS state and is announced as a link. It is hidden until `account.config()` resolves `{google:true}`.
  - **`config()`:** fetched once at start and cached. If it fails, assume false.
  - **`login.js` `name` mode:** only the Name field and its hint; the title and button say "Pick a name" and "Continue"; the swap link and the Google button are hidden; submitting calls `enter('name', typed)`, which `account.js` sends to `/api/google/name`.
  - **`main.js`, at start:**

```js
const auth = new URLSearchParams(location.search).get('auth');
if (auth) history.replaceState(null, '', location.pathname + location.hash);
```

    Then: `in` → the account's usual `refresh()`/`me` path, then Home; `name` → `openLogin('name')`; `failed` → `openLogin('login')` and show the `google` error.
  - Check the breadcrumb word for the name mode: "Pick a name".
- [ ] **Step 4:** Run `npm test`, `npm run test:server` and `npx playwright test`. Expected: everything passes.
- [ ] **Step 5: Commit:** `git add -A; git commit -m "feat: Google sign-in on the log-in screen, and Pick a name"`

### Task 8: UI gate on the built screens, code review, docs

- [ ] **Step 1:** Shoot the built screens (the 5 mockup states, plus Home signed in after Pick a name) at the 8 sizes with real scrollbars. Hand them to a fresh UI-review agent and compare them with the approved mockup. Fix and re-shoot until it passes.
- [ ] **Step 2:** Code review by a separate agent over `git diff main...signup`, focused on:
  - the OAuth state and PKCE;
  - the cookie flags;
  - open redirects (all redirect targets are fixed paths);
  - no token or code logged;
  - the hourly limit;
  - a race on picking a name.

  Fix its high findings.
- [ ] **Step 3:** Update the accounts spec with a line pointing at this spec for sign-up, and update `deploy/README.md`'s invite section to say invites are now optional.
- [ ] **Step 4:** Run the full suite again. Commit. Send the user ≤2 screenshots and a one-line summary, and ask to merge.

### Task 9: Go live (the user's steps, one per message)

1. Create the Google OAuth client, with the redirect URI from the README.
2. Write `~/apps/mathtime/deploy/secrets.env` with the three values, then `chmod 600`.
3. `git pull`, then `~/apps/mathtime/deploy/deploy.sh`.
4. Check it from a phone on cellular: sign up with a new name, and sign in with Google.
