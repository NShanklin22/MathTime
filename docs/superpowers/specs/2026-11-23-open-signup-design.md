# Open sign-up and Google sign-in: design

Date: 2026-11-23. This builds on the accounts spec (2026-11-09-accounts-design.md).
Today sign-up is invite-only. This piece opens it in two ways:

1. **Open sign-up:** anyone makes a name and a password, with no code.
2. **Google sign-in:** one tap with a Google account, then you pick a name.

Not in this piece:
- passkeys (planned next);
- Sign in with Apple (only if asked for; it costs $99 a year);
- email links;
- linking Google to an existing password account.

## 1. Open sign-up

**Server.** `POST /api/signup` no longer needs `invite`:
- With no `invite`, or an empty one, it makes a new account.
- With a code, it works as it does today. An invite makes an account, and a reset code sets a new password on its account.
- `OPEN_SIGNUP=0` in the environment turns open sign-up off again. A sign-up without a code then gets 403 `{error:'invite'}`, as today.

**Abuse:**
- Every try still counts against the address: 10 a minute (`limitAddress`).
- New: an address may make at most **5 accounts an hour**. The sixth gets 429 `{error:'rate'}`. This uses a second limiter with a one-hour window; failed tries don't count.
- New: a honeypot. The form has a field named `website` that people can't see or tab to. If it is filled in, the server answers 400 `{error:'name'}` and makes nothing.

**Screen.** The Sign up form becomes Name, Password, then Sign up.
- The code field is hidden behind a quiet link under the button, "Have a code?". Clicking it shows the field (labelled "Code"), and it stays shown until the screen is left.
- On Log in, "Have an invite? Sign up" becomes "New here? Sign up".
- The name and password hints and their checks stay as they are.

## 2. Google sign-in

This uses Google's server-side OAuth (authorization code with PKCE). The page loads no script from Google: the button is MathTime's own, drawn in the app's style.

**Scope:** `openid` only. MathTime stores Google's account id (`sub`) and nothing else: no email, no real name, no photo. Names on the boards stay names the players choose.

**Flow:**
1. The "Continue with Google" button goes to `GET /api/google/start`. The server makes `state` and a PKCE verifier and puts them in a 10-minute cookie, `mt_oauth` (HttpOnly, Secure, SameSite=Lax, Path=/api/google). It then sends the browser to Google's consent screen with `prompt=select_account`.
2. Google sends the browser back to `GET /api/google/callback?code&state`. The server:
   - checks `state` against the cookie;
   - swaps the code for tokens at `https://oauth2.googleapis.com/token`, sending the client secret and the verifier;
   - checks the ID token's `iss`, `aud` and `exp`. It came straight from Google over TLS, so no signature check is needed (OIDC Core §3.1.3.7).
3. Then one of three things happens:
   - **The `sub` already has an account:** start a session and redirect to `/?auth=in`.
   - **It's a new `sub`:** keep a pending sign-up, a row in `pending` that lasts 15 minutes, with its token in the cookie `mt_pending`. Redirect to `/?auth=name`.
   - **Anything fails** (cancelled, bad state, Google error): redirect to `/?auth=failed`.
4. **Pick a name screen.** Opened by `?auth=name`, it has one field, Name, with the same hint and rules. Its button is "Continue", and it sends `POST /api/google/name {name}`. That makes the account with no password, links the `sub` to it, starts a session and answers 201 `{name}`. A name already in use gets 409 `taken`, shown the usual way. An expired or missing pending sign-up gets 401 `{error:'google'}`, and the screen says "Google sign-in expired: try again".
5. **Back in the app.** The client reads `auth`, removes it from the URL with `history.replaceState`, and acts on it:
   - `in`: load the account as after a log-in, then show Home;
   - `name`: open Pick a name;
   - `failed`: open Log in with the error "Google sign-in didn't work".

**Where the button goes.** It appears on Log in and on Sign up, under the form's own button, after a thin rule with "or".

**Turning it on.** `GET /api/config` answers `{google: true|false}`, so the button shows only when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `PUBLIC_URL` are all set. The redirect URI is `${PUBLIC_URL}/api/google/callback`.

**Accounts with no password.** A Google account's `pw_hash` is `'!'`, which never verifies. Logging in by name with any password gets `mismatch`, as for a wrong password. A reset code from the CLI can still give such an account a password.

## 3. Data

These are new tables, added with `CREATE TABLE IF NOT EXISTS` as `daily` was:

```sql
CREATE TABLE IF NOT EXISTS identities (
  provider   TEXT NOT NULL,              -- 'google'
  subject    TEXT NOT NULL,              -- the provider's account id (sub)
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE TABLE IF NOT EXISTS pending (
  token_hash TEXT PRIMARY KEY,           -- SHA-256 of the mt_pending cookie
  provider   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
```

Expired `pending` rows are deleted whenever a new one is written.

## 4. Errors added to ERRORS (account.js)

- `google`: "Google sign-in didn't work". If the pending sign-up has expired, the Pick a name screen says "Google sign-in expired: try again" instead.

## 5. Deploy (your steps, one at a time when we get there)

1. Create an OAuth client (type: Web application) in Google Cloud Console, with the redirect URI `https://math.nshanklin.com/api/google/callback`.
2. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `PUBLIC_URL=https://math.nshanklin.com` in `~/apps/mathtime/deploy/secrets.env` on mainframe, mode 600. Not `deploy/.env`, which deploy.sh rewrites each time. secrets.env is not in git (.gitignore), and compose loads it with `env_file: {path: secrets.env, required: false}`.
3. Run `deploy.sh`. Open sign-up works without steps 1–2, and the Google button stays hidden until they are done.

## 6. Testing

- **Server unit tests:**
  - open sign-up;
  - `OPEN_SIGNUP=0`;
  - the honeypot;
  - 5 accounts an hour;
  - invite and reset paths unchanged;
  - Google start: the redirect URL, state and PKCE;
  - the callback, with Google's token endpoint mocked through an injected `fetch`: a known sub, a new sub, a bad state, a wrong `aud`, an expired token;
  - picking a name: ok, taken, expired;
  - `/api/config`.
- **E2E (fixtures' fake API):**
  - sign up with no code;
  - "Have a code?" shows the field;
  - the Google button shown or hidden by config;
  - `?auth=name` → Pick a name → Home signed in;
  - `?auth=failed` → the error on Log in.
- **UI gate:** a mockup of Log in, Sign up (with and without the code field) and Pick a name, approved by the UI-review agent at all 8 sizes before building, and the built screens shot and approved again.
