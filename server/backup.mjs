// A copy of the database for each day, keeping the last 14 days: `node backup.mjs <folder>`.
// deploy/backup.sh runs it in the container, daily from cron and before each deploy. A second run on the
// same day replaces that day's copy. VACUUM INTO makes a consistent copy while the server keeps running.
import { readdirSync, rmSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDb, backupTo, DAY } from './store.mjs';

export const KEEP_DAYS = 14;
const DAILY = /^mathtime-(\d{4}-\d{2}-\d{2})\.db$/;

export function backup(dbPath, dir, date = new Date()) {
  mkdirSync(dir, { recursive: true });
  const day = date.toISOString().slice(0, 10);   // 2026-11-09, UTC
  const file = join(dir, `mathtime-${day}.db`);
  const temp = `${file}.part`;
  rmSync(temp, { force: true });                 // VACUUM INTO won't overwrite
  const db = openDb(dbPath);
  try {
    backupTo(db, temp);
  } finally {
    db.close();
  }
  renameSync(temp, file);
  // Days before the last 14 (today and the 13 before it) go.
  const oldest = new Date(Date.parse(day) - (KEEP_DAYS - 1) * DAY).toISOString().slice(0, 10);
  const old = readdirSync(dir).filter((f) => DAILY.test(f) && f.match(DAILY)[1] < oldest).sort();
  for (const f of old) rmSync(join(dir, f));
  return { file, removed: old };
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node backup.mjs <folder>');
    process.exit(2);
  }
  const { file, removed } = backup(process.env.DB_PATH || 'data/mathtime.db', dir);
  console.log(`Backed up to ${file}${removed.length ? `; removed ${removed.length} older` : ''}`);
}
