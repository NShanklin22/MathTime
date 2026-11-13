// cli.mjs (invite, reset, users) and backup.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDb, createUser, DAY } from '../store.mjs';
import { run } from '../cli.mjs';
import { backup, KEEP_DAYS } from '../backup.mjs';

const serverDir = fileURLToPath(new URL('..', import.meta.url));

test('invite makes a new single-use code each time, lasting 14 days', () => {
  const db = openDb(':memory:');
  const now = Date.parse('2026-11-09T12:00:00Z');
  const a = run(db, ['invite'], now).out;
  const b = run(db, ['invite'], now).out;
  assert.match(a, /^MATH-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  assert.notEqual(a, b);
  const row = db.prepare('SELECT * FROM codes WHERE code = ?').get(a);
  assert.equal(row.expires_at - row.created_at, 14 * DAY);
  assert.equal(row.user_id, null);
  assert.equal(row.used_at, null);
});

test('reset needs a known name; users lists names', () => {
  const db = openDb(':memory:');
  assert.equal(run(db, ['users']).out, '(no accounts yet)');
  createUser(db, { name: 'Sam', pwHash: 'x', now: 0 });
  createUser(db, { name: 'alex', pwHash: 'x', now: 0 });
  assert.equal(run(db, ['users']).out, 'alex\nSam');
  const reset = run(db, ['reset', 'sam']);
  assert.match(reset.out, /^MATH-\S+\nSign up with this code and the name Sam/);
  assert.equal(db.prepare('SELECT user_id FROM codes').get().user_id, 1);
  assert.equal(run(db, ['reset', 'nobody']).code, 1);
  assert.equal(run(db, ['reset']).code, 2);
  assert.equal(run(db, ['what']).code, 2);
});

test('runs as a command against DB_PATH', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mt-cli-'));
  try {
    const env = { ...process.env, DB_PATH: join(dir, 'mathtime.db'), NODE_NO_WARNINGS: '1' };
    const out = execFileSync(process.execPath, ['cli.mjs', 'invite'], { cwd: serverDir, env, encoding: 'utf8' });
    assert.match(out.trim(), /^MATH-\S{4}-\S{4}$/);
    const db = new DatabaseSync(env.DB_PATH);
    assert.equal(db.prepare('SELECT code FROM codes').get().code, out.trim());
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backup keeps one copy a day, for the last 14 days', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mt-backup-'));
  const dbPath = join(dir, 'mathtime.db');
  const db = openDb(dbPath);
  try {
    createUser(db, { name: 'sam', pwHash: 'x', now: 0 });
    const backups = join(dir, 'backups');
    for (let day = 1; day <= 20; day++) {
      backup(dbPath, backups, new Date(Date.UTC(2026, 10, day, 3, 17)));
    }
    writeFileSync(join(backups, 'notes.txt'), 'left alone');
    // A second run on the 20th (a deploy after the night's run) replaces that day's copy.
    createUser(db, { name: 'pat', pwHash: 'x', now: 0 });
    const { file } = backup(dbPath, backups, new Date(Date.UTC(2026, 10, 20, 18, 0)));
    assert.equal(file, join(backups, 'mathtime-2026-11-20.db'));
    const kept = readdirSync(backups).sort();
    assert.equal(kept.length, KEEP_DAYS + 1);
    assert.equal(kept[0], 'mathtime-2026-11-07.db');
    assert.equal(kept.at(-2), 'mathtime-2026-11-20.db');
    assert.ok(kept.includes('notes.txt'));
    const copy = new DatabaseSync(file);
    assert.deepEqual(copy.prepare('SELECT name FROM users ORDER BY id').all().map((r) => r.name), ['sam', 'pat']);
    copy.close();

    // After days without a run, the older copies still go by date.
    const later = backup(dbPath, backups, new Date(Date.UTC(2026, 11, 1, 3, 17)));
    assert.equal(later.removed.length, 11);   // 7-17 Nov: older than 18 Nov, 14 days before 1 Dec
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
