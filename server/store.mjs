// The API's data: accounts, sessions, identities, pending sign-ups, invite and reset codes, and runs,
// in one SQLite file (accounts spec §6, open sign-up spec §3). Every function here is synchronous; only password hashing (auth.mjs) waits.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomInt } from 'node:crypto';

export const DAY = 24 * 60 * 60 * 1000;
export const CODE_LIFE = 14 * DAY;        // an invite or reset code works once, for 14 days
export const SESSION_LIFE = 365 * DAY;    // a session lasts a year from its last renewal
export const PENDING_LIFE = 15 * 60 * 1000;   // a Google sign-up waits 15 minutes for its name

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,              -- as typed at sign-up
      name_lc    TEXT NOT NULL UNIQUE,       -- names are case-insensitive
      pw_hash    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,           -- SHA-256 of the cookie; the cookie itself is never stored
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      renewed_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    -- An invite has no user_id. A reset code has the account it sets a new password on.
    CREATE TABLE IF NOT EXISTS codes (
      code       TEXT PRIMARY KEY,
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at    INTEGER
    );
    CREATE TABLE IF NOT EXISTS runs (
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id          TEXT NOT NULL,             -- made in the browser, so a retried upload is stored once
      level       INTEGER NOT NULL,
      finished_at TEXT NOT NULL,
      total_ms    INTEGER NOT NULL,
      misses      INTEGER NOT NULL,
      record      TEXT NOT NULL,             -- the whole record as JSON, for later pieces
      received_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS runs_best ON runs(user_id, level, total_ms);
    -- Daily challenge scores (daily spec §5): one a player a date, the first try that ended.
    -- Added after the tables above; CREATE IF NOT EXISTS adds it to a database made before it.
    CREATE TABLE IF NOT EXISTS daily (
      date        TEXT NOT NULL,             -- the player's own calendar date, YYYY-MM-DD
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id          TEXT NOT NULL,             -- the record's id, so a resend is told from a second try
      out         INTEGER NOT NULL,          -- 1 when out, 0 when finished
      total_ms    INTEGER,                   -- null when out
      reached     INTEGER NOT NULL,          -- the question it ended on; 20 when finished
      record      TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      PRIMARY KEY (date, user_id)
    );
    -- Google sign-in (open sign-up spec §3): an account's link to a provider's account id, and a
    -- sign-up waiting for its name. Only the id (sub) is kept: no email, no real name.
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
  `);
  return db;
}

// Runs fn inside one write transaction, so a code can't be used twice, even by two processes.
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/* ---------- Codes ---------- */

// No 0/O, 1/I/L: the code is read off a screen and typed on a phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export function normalizeCode(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

export function createCode(db, { userId = null, now = Date.now() } = {}) {
  for (;;) {
    const code = `MATH-${part()}-${part()}`;
    const { changes } = db
      .prepare('INSERT OR IGNORE INTO codes (code, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(code, userId, now, now + CODE_LIFE);
    if (changes) return code;
  }
}

// The code's row if it can still be used, else undefined.
export function usableCode(db, code, now) {
  return db
    .prepare('SELECT * FROM codes WHERE code = ? AND used_at IS NULL AND expires_at > ?')
    .get(normalizeCode(code), now);
}

export function useCode(db, code, now) {
  db.prepare('UPDATE codes SET used_at = ? WHERE code = ?').run(now, code);
}

/* ---------- Users ---------- */

export function findUser(db, name) {
  if (typeof name !== 'string') return undefined;
  return db.prepare('SELECT * FROM users WHERE name_lc = ?').get(name.toLowerCase());
}

export function userById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function createUser(db, { name, pwHash, now }) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (name, name_lc, pw_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(name, name.toLowerCase(), pwHash, now);
  return Number(lastInsertRowid);
}

export function setPassword(db, userId, pwHash) {
  db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?').run(pwHash, userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function listUsers(db) {
  return db.prepare('SELECT name, created_at FROM users ORDER BY name_lc').all();
}

/* ---------- Identities and pending sign-ups ---------- */

export function addIdentity(db, { provider, subject, userId, now }) {
  db.prepare('INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run(provider, subject, userId, now);
}

// The account linked to the provider's account id, or undefined.
export function userByIdentity(db, provider, subject) {
  return db
    .prepare('SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?')
    .get(provider, subject);
}

// Expired rows go whenever a new one is written, so the table holds only the last 15 minutes' worth.
export function addPending(db, { tokenHash, provider, subject, expiresAt, now }) {
  db.prepare('DELETE FROM pending WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO pending (token_hash, provider, subject, expires_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash, provider, subject, expiresAt);
}

export function findPending(db, tokenHash, now) {
  return db.prepare('SELECT * FROM pending WHERE token_hash = ? AND expires_at > ?').get(tokenHash, now);
}

export function deletePending(db, tokenHash) {
  db.prepare('DELETE FROM pending WHERE token_hash = ?').run(tokenHash);
}

/* ---------- Sessions ---------- */

export function createSession(db, { tokenHash, userId, now }) {
  db.prepare('INSERT INTO sessions (token_hash, user_id, renewed_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash, userId, now, now + SESSION_LIFE);
}

export function findSession(db, tokenHash, now) {
  const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
  if (!session) return undefined;
  if (session.expires_at <= now) {
    deleteSession(db, tokenHash);
    return undefined;
  }
  return session;
}

export function renewSession(db, tokenHash, now) {
  db.prepare('UPDATE sessions SET renewed_at = ?, expires_at = ? WHERE token_hash = ?')
    .run(now, now + SESSION_LIFE, tokenHash);
}

// Removes expired sessions; returns how many.
export function sweepSessions(db, now) {
  return Number(db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes);
}

export function deleteSession(db, tokenHash) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

/* ---------- Runs ---------- */

// true when stored, false when this account already has a run with that id.
export function addRun(db, userId, record, now) {
  const { changes } = db
    .prepare(`INSERT OR IGNORE INTO runs (user_id, id, level, finished_at, total_ms, misses, record, received_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, record.id, record.level, record.finishedAt, record.totalMs, record.misses,
      JSON.stringify(record), now);
  return changes > 0;
}

export function bestTimes(db, userId) {
  const rows = db
    .prepare('SELECT level, MIN(total_ms) AS best FROM runs WHERE user_id = ? GROUP BY level ORDER BY level')
    .all(userId);
  return Object.fromEntries(rows.map((r) => [String(r.level), r.best]));
}

/* ---------- The daily challenge ---------- */

export const BOARD_ROWS = 200;

// 'stored' when stored; 'resent' when that score is already stored; 'taken' when the player
// already has a different score for the date, which is kept.
export function addDaily(db, userId, date, record, now) {
  const { changes } = db
    .prepare(`INSERT OR IGNORE INTO daily (date, user_id, id, out, total_ms, reached, record, received_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(date, userId, record.id, record.out ? 1 : 0, record.totalMs, record.reached,
      JSON.stringify(record), now);
  if (changes > 0) return 'stored';
  const kept = db.prepare('SELECT id FROM daily WHERE date = ? AND user_id = ?').get(date, userId);
  return kept.id === record.id ? 'resent' : 'taken';
}

// The date's board, best first: finishers by time, then outs by how far they got, then by when stored.
export function dailyBoard(db, date) {
  return db
    .prepare(`SELECT d.user_id, u.name, d.out, d.total_ms, d.reached FROM daily d JOIN users u ON u.id = d.user_id
              WHERE d.date = ?
              ORDER BY d.out, d.total_ms, d.reached DESC, d.received_at, u.name_lc
              LIMIT ?`)
    .all(date, BOARD_ROWS);
}

export function dailyCount(db, date) {
  return db.prepare('SELECT COUNT(*) AS n FROM daily WHERE date = ?').get(date).n;
}

// Every account's name, lower-cased, so made-up players never take one.
export function userNamesLc(db) {
  return new Set(db.prepare('SELECT name_lc FROM users').all().map((u) => u.name_lc));
}

// One player's score for the date, shaped as a board row, or undefined.
export function dailyScore(db, date, userId) {
  return db
    .prepare(`SELECT d.user_id, u.name, d.out, d.total_ms, d.reached FROM daily d JOIN users u ON u.id = d.user_id
              WHERE d.date = ? AND d.user_id = ?`)
    .get(date, userId);
}

// A score's place: one more than the scores strictly better, so ties share it, as on the board.
export function dailyPlace(db, date, score) {
  const better = score.out
    ? db.prepare('SELECT COUNT(*) AS n FROM daily WHERE date = ? AND (out = 0 OR reached > ?)').get(date, score.reached)
    : db.prepare('SELECT COUNT(*) AS n FROM daily WHERE date = ? AND out = 0 AND total_ms < ?').get(date, score.total_ms);
  return better.n + 1;
}

/* ---------- Backups ---------- */

export function backupTo(db, file) {
  db.prepare('VACUUM INTO ?').run(file);
}
