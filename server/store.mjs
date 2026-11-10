// The API's data: accounts, sessions, invite and reset codes, and runs, in one SQLite file
// (accounts spec §6). Every function here is synchronous; only password hashing (auth.mjs) waits.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomInt } from 'node:crypto';

export const DAY = 24 * 60 * 60 * 1000;
export const CODE_LIFE = 14 * DAY;        // an invite or reset code works once, for 14 days
export const SESSION_LIFE = 365 * DAY;    // a session lasts a year from its last renewal

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

/* ---------- Backups ---------- */

export function backupTo(db, file) {
  db.prepare('VACUUM INTO ?').run(file);
}
