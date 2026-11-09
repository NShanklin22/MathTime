# Accounts: sign up and log in

Decided 2026-11-09, in conversation. The user chose: invite-only sign-up, a name and password, the
first four levels free, a lock on the rest that opens log in, and the log-in link at the right of
the selector's header. The details below are the recommended defaults. This replaces runs spec §6's
per-device key: an account is what lets the API store runs (2026-11-01-runs-design.md §5–§6).

## 1. Who and how
- **Invite only.** You sign up with an invite code, a name and a password. Codes are made on
  mainframe (`docker compose exec api node cli.mjs invite`). Each code works once and lasts 14 days.
- **Name:** 3–20 letters, digits, `_` or `-`. Case-insensitive, so `Sam` and `sam` are the same player,
  shown as typed at sign-up.
- **Password:** at least 8 characters, any. Stored as a scrypt hash. A forgotten password is reset on
  mainframe (`cli.mjs reset <name>`), which prints a one-time code that works like an invite for that name.
- **Staying logged in:** a session cookie (`HttpOnly`, `Secure`, `SameSite=Strict`) lasting 1 year,
  renewed on use. Log out ends it on that device.

## 2. Free and locked levels
- **Free to everyone, signed in or not:** Levels 1–4 in build order: Addition 1, Subtraction 1,
  Subtraction 2, Multiplication 1. A level says so with `free: true`.
- **Signed out:** the other levels stay in their columns. A lock takes the place of the row's sample
  (or its check and time). Tapping the row, or Enter on it, opens log in, and once you are in, the
  level starts. The row's name reads "…, locked: log in to play".
- **Signed in:** every level plays, and rows look as they do today.
- The lock is the game's own, in the browser. The levels are static files, so this is a prompt to make
  an account, not a guard.
- The daily challenge on the first four, open to everyone, is the next piece, designed on its own.

## 3. The log-in screen
- One screen, opened from the header link or a locked row. Its breadcrumb is "Levels › Log in"; the
  "Levels" link and Esc go back without logging in.
- **Log in** (the default): Name, Password, a "Log in" button. Below it: "Have an invite? Sign up".
- **Sign up:** Invite code, Name, Password, "Sign up". Below it: "Have an account? Log in".
- Enter submits. Errors show under the button, in words, and keep what was typed except the password:
  "That name and password don't match", "That invite code isn't valid or has been used",
  "That name is taken", "Can't reach the server: try again".
- Done: back to where you came from, the selector or the level you tapped.
- On the keypad screens the system keyboard is used here, not the game's keypad.

## 4. The header link
- On the selector only, at the right of the "Levels" header, on the title's baseline.
- Signed out: "Log in". Signed in: your name; tapping it shows "Log out" in its place for 4 seconds
  (or until focus leaves), and tapping that logs out.

## 5. Runs and progress
- Signed in, every finished run is uploaded to your account (runs spec §6's queue, `POST /api/runs`),
  and best times come from your account (`GET /api/best`), so they follow you to another device.
- Runs finished on a device before logging in are uploaded to the account that logs in on it next,
  once. Signed out, runs stay in the browser as today.
- Log out keeps the browser's runs but stops uploading.

## 6. The API on mainframe
As runs spec §6 (Node in Docker on `127.0.0.1:3006`, SQLite in `~/apps/mathtime/data`, nginx `/api/`,
backed up by `deploy.sh`), with:
- `POST /api/signup {invite, name, password}`, `POST /api/login {name, password}`, `POST /api/logout`,
  `GET /api/me` (the name, or 401).
- Runs and best times are per account; without a session they answer 401.
- Login and sign-up are limited to 10 tries a minute per address and per name.

## 7. Building it
1. Mockup of the log-in screen, the header link and the locked rows, then a UI review, then the user's approval.
2. The API, its container, nginx and `deploy.sh`, with the README's invite and reset steps.
3. The screens and the upload.

## 8. Not in this piece
The daily challenge; email; passkeys; changing your name or password from the game; deleting an
account; seeing past runs.
