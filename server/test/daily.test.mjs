// The daily challenge's scores and board (daily spec §5).
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startApi, record } from './helpers.mjs';
import { openDb } from '../store.mjs';
import { BOARD_RATE_LIMIT } from '../app.mjs';

let api;
beforeEach(async () => { api = await startApi(); });   // the clock reads 2026-11-09T12:00Z
afterEach(() => api.close());

const TODAY = '2026-11-09';
const count = () => api.db.prepare('SELECT COUNT(*) AS n FROM daily').get().n;

// A daily try's record, as the browser makes it: a run's record with daily, out and reached.
function finished(totalMs, over = {}) {
  const { level, ...rest } = record({ totalMs });
  return { ...rest, daily: true, out: false, reached: 20, ...over };
}
function outAt(reached, over = {}) {
  const { level, totalMs, ...rest } = record();
  return { ...rest, problems: rest.problems.slice(0, reached), daily: true, out: true, reached, ...over };
}

const post = (cookie, body, opts) => api.call('POST', '/api/daily', { cookie, body, ...opts });
const board = (date = TODAY, opts) => api.call('GET', `/api/daily/${date}`, opts);

describe('POST /api/daily', () => {
  test('201 {date} for a finished try, stored with its time', async () => {
    const cookie = await api.signup('sam');
    const sent = finished(64200);
    const res = await post(cookie, { date: TODAY, record: sent });
    assert.equal(res.status, 201);
    assert.deepEqual(res.json, { date: TODAY });
    const row = api.db.prepare('SELECT * FROM daily').get();
    assert.equal(row.date, TODAY);
    assert.equal(row.id, sent.id);
    assert.equal(row.out, 0);
    assert.equal(row.total_ms, 64200);
    assert.equal(row.reached, 20);
    assert.deepEqual(JSON.parse(row.record), sent);
  });

  test('201 for an out, stored with no time and the question it ended on', async () => {
    const cookie = await api.signup('sam');
    const res = await post(cookie, { date: TODAY, record: outAt(7) });
    assert.equal(res.status, 201);
    const row = api.db.prepare('SELECT * FROM daily').get();
    assert.equal(row.out, 1);
    assert.equal(row.total_ms, null);
    assert.equal(row.reached, 7);
    assert.equal(JSON.parse(row.record).totalMs, null);
  });

  test('a finished try may leave reached out; it is stored as 20', async () => {
    const cookie = await api.signup('sam');
    const { reached, ...sent } = finished(50000);
    assert.equal((await post(cookie, { date: TODAY, record: sent })).status, 201);
    assert.equal(api.db.prepare('SELECT reached FROM daily').get().reached, 20);
  });

  test('the same record sent again is 200 {date}, stored once', async () => {
    const cookie = await api.signup('sam');
    const sent = finished(64200);
    assert.equal((await post(cookie, { date: TODAY, record: sent })).status, 201);
    const again = await post(cookie, { date: TODAY, record: sent });
    assert.equal(again.status, 200);
    assert.deepEqual(again.json, { date: TODAY });
    assert.equal(count(), 1);
  });

  test('409 taken for a second try that day, and the first score is kept', async () => {
    const cookie = await api.signup('sam');
    const first = outAt(3);
    assert.equal((await post(cookie, { date: TODAY, record: first })).status, 201);
    const second = await post(cookie, { date: TODAY, record: finished(30000) });
    assert.equal(second.status, 409);
    assert.deepEqual(second.json, { error: 'taken' });
    const row = api.db.prepare('SELECT * FROM daily').get();
    assert.equal(row.id, first.id);
    assert.equal(row.reached, 3);
    assert.equal(row.total_ms, null);
    assert.deepEqual((await board()).json.rows.map((r) => [r.totalMs, r.reached]), [[null, 3]]);
  });

  test('a score a date: another date is a new score; another player has their own', async () => {
    const sam = await api.signup('sam');
    const pat = await api.signup('pat');
    const sent = finished(40000);
    assert.equal((await post(sam, { date: TODAY, record: sent })).status, 201);
    assert.equal((await post(sam, { date: '2026-11-10', record: finished(41000) })).status, 201);
    assert.equal((await post(pat, { date: TODAY, record: sent })).status, 201, 'the same id, another player');
    assert.equal(count(), 3);
  });

  test('401 session with no session, or a dead one, and nothing is stored', async () => {
    const body = { date: TODAY, record: finished(40000) };
    const none = await post(undefined, body);
    assert.equal(none.status, 401);
    assert.deepEqual(none.json, { error: 'session' });
    const dead = await post(`mt_session=${'a'.repeat(43)}`, body);
    assert.equal(dead.status, 401);
    assert.equal(count(), 0);
  });

  test('415 for a body that is not JSON, 413 over 64KB', async () => {
    const cookie = await api.signup('sam');
    const raw = JSON.stringify({ date: TODAY, record: finished(40000) });
    const type = await api.call('POST', '/api/daily', { cookie, raw, headers: { 'Content-Type': 'text/plain' } });
    assert.equal(type.status, 415);
    const big = await api.call('POST', '/api/daily',
      { cookie, raw: 'x'.repeat(65 * 1024), headers: { 'Content-Type': 'application/json' } });
    assert.equal(big.status, 413);
    assert.equal(count(), 0);
  });

  test('the date may be a day either side of the server\'s UTC date, no further', async () => {
    const cookie = await api.signup('sam');
    for (const [date, status] of [
      ['2026-11-07', 400], ['2026-11-08', 201], ['2026-11-10', 201], ['2026-11-11', 400], ['2025-11-09', 400],
    ]) {
      const res = await post(cookie, { date, record: finished(40000) });
      assert.equal(res.status, status, date);
      if (status === 400) assert.deepEqual(res.json, { error: 'date' });
    }
    // The window follows the server's UTC date, not its time of day.
    const pat = await api.signup('pat');
    api.clock.t = Date.parse('2026-11-09T23:30:00Z');
    assert.equal((await post(pat, { date: '2026-11-10', record: finished(40000) })).status, 201);
    assert.equal((await post(pat, { date: '2026-11-11', record: finished(40000) })).status, 400);
    api.clock.t = Date.parse('2026-11-10T00:30:00Z');
    assert.equal((await post(pat, { date: TODAY, record: finished(40000) })).status, 201);
    assert.equal((await post(pat, { date: '2026-11-11', record: finished(40000) })).status, 201);
    assert.equal((await post(pat, { date: '2026-11-08', record: finished(40000) })).status, 400);
  });

  test('400 date when the date is not a real YYYY-MM-DD date', async () => {
    const cookie = await api.signup('sam');
    for (const date of [
      undefined, null, 20261109, '', '2026-11-9', '2026/11/09', '09-11-2026', '2026-11-09T00:00:00Z',
      ' 2026-11-09', '2026-02-30', '2026-13-01', '2026-11-31', '2026-11-00', 'today',
    ]) {
      const res = await post(cookie, { date, record: finished(40000) });
      assert.equal(res.status, 400, JSON.stringify(date));
      assert.deepEqual(res.json, { error: 'date' });
    }
    assert.equal(count(), 0);
  });

  test('400 record for a malformed record', async () => {
    const cookie = await api.signup('sam');
    const good = finished(40000);
    const out = outAt(5);
    const bad = [
      undefined, null, [], 'run', 42,
      { ...good, id: undefined }, { ...good, id: '' }, { ...good, id: 'x'.repeat(65) }, { ...good, id: 'a b' },
      { ...good, finishedAt: 'yesterday' }, { ...good, finishedAt: 7 },
      { ...good, misses: -1 }, { ...good, misses: null },
      { ...good, problems: [] }, { ...good, problems: 'none' }, { ...good, problems: [null] },
      { ...good, problems: [...good.problems, good.problems[0]] },
      { ...good, problems: [{ a: 1, b: 2, ms: 3 }] }, { ...good, problems: [{ a: '1', b: 2, ms: 3, misses: 0 }] },
      { ...good, daily: undefined }, { ...good, daily: 'yes' }, { ...good, out: undefined }, { ...good, out: 0 },
      // finished: a whole time over 0, reached 20, and exactly 20 problems
      { ...good, totalMs: undefined }, { ...good, totalMs: null }, { ...good, totalMs: -1 }, { ...good, totalMs: 0 },
      { ...good, totalMs: 1.5 }, { ...good, totalMs: '40000' }, { ...good, reached: 19 }, { ...good, reached: null },
      { ...good, problems: good.problems.slice(0, 19) }, { ...good, problems: good.problems.slice(0, 1) },
      // out: reached is its number of problems, 1-20, and no time
      { ...out, reached: undefined }, { ...out, reached: 0 }, { ...out, reached: 21 }, { ...out, reached: 2.5 },
      { ...out, reached: '5' }, { ...out, totalMs: 40000 }, { ...out, totalMs: 0 },
      { ...out, reached: 4 }, { ...out, reached: 6 }, { ...out, problems: out.problems.slice(0, 4) },
      { ...outAt(20), problems: [...good.problems, good.problems[0]], reached: 21 },
    ];
    for (const sent of bad) {
      const res = await post(cookie, { date: TODAY, record: sent });
      assert.equal(res.status, 400, JSON.stringify(sent)?.slice(0, 100));
      assert.deepEqual(res.json, { error: 'record' });
    }
    assert.equal((await post(cookie, {})).json.error, 'date', 'no date');
    const empty = await api.call('POST', '/api/daily', { cookie });
    assert.equal(empty.status, 400);
    assert.equal(count(), 0);
  });

  test('keeps only the record\'s own fields; an out at 1 or 20 is fine', async () => {
    const sam = await api.signup('sam');
    const sent = outAt(20, { level: 3, extra: 'x' });
    assert.equal((await post(sam, { date: TODAY, record: sent })).status, 201);
    const stored = JSON.parse(api.db.prepare('SELECT record FROM daily').get().record);
    assert.deepEqual(Object.keys(stored).sort(),
      ['daily', 'finishedAt', 'id', 'misses', 'out', 'problems', 'reached', 'totalMs']);
    const pat = await api.signup('pat');
    assert.equal((await post(pat, { date: TODAY, record: outAt(1) })).status, 201);
    const kim = await api.signup('kim');
    assert.equal((await post(kim, { date: TODAY, record: finished(1) })).status, 201, '1 ms is over 0');
  });

  test('the name the try was ended under: 403 owner when it is not this account\'s, nothing stored', async () => {
    const sam = await api.signup('Sam');
    for (const name of ['pat', '', 'Sam ', 42, null]) {
      const res = await post(sam, { date: TODAY, record: finished(40000), name });
      assert.equal(res.status, 403, JSON.stringify(name));
      assert.deepEqual(res.json, { error: 'owner' });
    }
    assert.equal(count(), 0);
    assert.equal((await post(sam, { date: TODAY, record: finished(40000), name: 'sAM' })).status, 201, 'any case');
    const pat = await api.signup('pat');
    assert.equal((await post(pat, { date: TODAY, record: finished(40000) })).status, 201, 'name may be left out');
  });
});

describe('POST /api/runs owner check', () => {
  test('403 owner when the name is not this account\'s; any case, or no name, is stored', async () => {
    const sam = await api.signup('Sam');
    const runs = (body) => api.call('POST', '/api/runs', { cookie: sam, body });
    for (const name of ['pat', '', 42, null]) {
      const res = await runs({ ...record(), name });
      assert.equal(res.status, 403, JSON.stringify(name));
      assert.deepEqual(res.json, { error: 'owner' });
    }
    assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 0);
    const named = record();
    assert.equal((await runs({ ...named, name: 'sam' })).status, 201);
    const { record: stored } = api.db.prepare('SELECT record FROM runs').get();
    assert.deepEqual(JSON.parse(stored), named, 'the name is not kept in the record');
    assert.equal((await runs(record())).status, 201);
  });

  test('401 still comes first with no session', async () => {
    const res = await api.call('POST', '/api/runs', { body: { ...record(), name: 'pat' } });
    assert.equal(res.status, 401);
  });
});

describe('GET /api/daily/:date', () => {
  // Signs up each name and posts its try for today, in this order.
  async function play(tries) {
    const cookies = {};
    for (const [name, sent] of tries) {
      cookies[name] = await api.signup(name);
      api.clock.t += 1000;
      assert.equal((await post(cookies[name], { date: TODAY, record: sent })).status, 201, name);
    }
    return cookies;
  }

  test('finishers fastest first, ties sharing a place; then outs by how far they got, then by when stored', async () => {
    await play([
      ['outEarly', outAt(4)],
      ['slow', finished(90000)],
      ['outFar', outAt(15)],
      ['tieA', finished(60000)],
      ['fast', finished(45000)],
      ['tieB', finished(60000)],
      ['outLate', outAt(4)],
    ]);
    const res = await board();
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      date: TODAY,
      total: 7,
      rows: [
        { place: 1, name: 'fast', totalMs: 45000, reached: 20, you: false },
        { place: 2, name: 'tieA', totalMs: 60000, reached: 20, you: false },
        { place: 2, name: 'tieB', totalMs: 60000, reached: 20, you: false },
        { place: 4, name: 'slow', totalMs: 90000, reached: 20, you: false },
        { place: 5, name: 'outFar', totalMs: null, reached: 15, you: false },
        { place: 6, name: 'outEarly', totalMs: null, reached: 4, you: false },
        { place: 6, name: 'outLate', totalMs: null, reached: 4, you: false },
      ],
    });
  });

  test('you is true on the caller\'s own row only, with a valid session; no session is needed', async () => {
    const cookies = await play([['sam', finished(50000)], ['pat', outAt(9)]]);
    const anyone = await board();
    assert.equal(anyone.status, 200);
    assert.deepEqual(anyone.json.rows.map((r) => r.you), [false, false]);
    assert.deepEqual((await board(TODAY, { cookie: cookies.pat })).json.rows.map((r) => r.you), [false, true]);
    assert.deepEqual((await board(TODAY, { cookie: cookies.sam })).json.rows.map((r) => r.you), [true, false]);
    const dead = await board(TODAY, { cookie: `mt_session=${'a'.repeat(43)}` });
    assert.equal(dead.status, 200);
    assert.deepEqual(dead.json.rows.map((r) => r.you), [false, false]);
    const logout = await api.call('POST', '/api/logout', { cookie: cookies.sam });
    assert.equal(logout.status, 204);
    assert.deepEqual((await board(TODAY, { cookie: cookies.sam })).json.rows.map((r) => r.you), [false, false]);
    // A player with no score today sees no row of theirs.
    const kim = await api.signup('kim');
    assert.deepEqual((await board(TODAY, { cookie: kim })).json.rows.map((r) => r.you), [false, false]);
  });

  test('only that date\'s scores; an empty board for a date with none', async () => {
    await play([['sam', finished(50000)]]);
    assert.deepEqual((await board('2026-11-10')).json, { date: '2026-11-10', total: 0, rows: [] });
    assert.deepEqual((await board('2020-01-01')).json, { date: '2020-01-01', total: 0, rows: [] });
    assert.equal((await board()).json.total, 1);
  });

  test('400 date for a date that is not real', async () => {
    for (const date of ['2026-02-30', '2026-11-9', 'today', '2026-11-09x', '%E0%A4%A']) {
      const res = await board(date);
      assert.equal(res.status, 400, date);
      assert.deepEqual(res.json, { error: 'date' });
    }
    assert.equal((await api.call('GET', '/api/daily/')).status, 404);
    assert.equal((await api.call('GET', '/api/daily/2026-11-09/x')).status, 404);
  });

  test('the wrong method is 405', async () => {
    const get = await api.call('GET', '/api/daily');
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST');
    const postBoard = await api.call('POST', `/api/daily/${TODAY}`, { body: {} });
    assert.equal(postBoard.status, 405);
    assert.equal(postBoard.headers.get('allow'), 'GET');
  });

  // 205 finishers p1..p205, p205 fastest, p1 slowest; later sign-ups take the ids after them.
  function crowd(n = 205) {
    const insertUser = api.db.prepare('INSERT INTO users (id, name, name_lc, pw_hash, created_at) VALUES (?, ?, ?, ?, 0)');
    const insertDaily = api.db.prepare(`INSERT INTO daily (date, user_id, id, out, total_ms, reached, record, received_at)
                                         VALUES (?, ?, ?, 0, ?, 20, '{}', ?)`);
    for (let i = 1; i <= n; i++) {
      insertUser.run(i, `p${i}`, `p${i}`, 'x');
      insertDaily.run(TODAY, i, `r${i}`, 100000 - i, i);
    }
  }

  test('at most 200 rows, the best; total counts every score', async () => {
    crowd();
    const { total, rows } = (await board()).json;
    assert.equal(total, 205);
    assert.equal(rows.length, 200);
    assert.equal(rows[0].name, 'p205');
    assert.equal(rows[0].place, 1);
    assert.equal(rows.at(-1).name, 'p6');
    assert.equal(rows.at(-1).place, 200);
    assert.ok(rows.every((r) => !r.you));
  });

  test('a caller past the first 200 gets their own row last, with its real place', async () => {
    crowd();
    // A finisher tying p3 (place 203, shared), and an out (after every finisher).
    const slow = await api.signup('slow');
    assert.equal((await post(slow, { date: TODAY, record: finished(100000 - 3) })).status, 201);
    const gone = await api.signup('gone');
    assert.equal((await post(gone, { date: TODAY, record: outAt(12) })).status, 201);
    const late = await api.signup('late');
    assert.equal((await post(late, { date: TODAY, record: outAt(15) })).status, 201);

    const asSlow = (await board(TODAY, { cookie: slow })).json;
    assert.equal(asSlow.total, 208);
    assert.equal(asSlow.rows.length, 201);
    assert.deepEqual(asSlow.rows.at(-1), { place: 203, name: 'slow', totalMs: 99997, reached: 20, you: true });
    assert.equal(asSlow.rows.filter((r) => r.you).length, 1);

    const asGone = (await board(TODAY, { cookie: gone })).json;
    assert.deepEqual(asGone.rows.at(-1), { place: 208, name: 'gone', totalMs: null, reached: 12, you: true });
    const asLate = (await board(TODAY, { cookie: late })).json;
    assert.deepEqual(asLate.rows.at(-1), { place: 207, name: 'late', totalMs: null, reached: 15, you: true });

    // Not added for someone without a session, or with no score, or already in the first 200.
    assert.equal((await board()).json.rows.length, 200);
    const none = await api.signup('none');
    assert.equal((await board(TODAY, { cookie: none })).json.rows.length, 200);
    const quick = await api.signup('quick');
    assert.equal((await post(quick, { date: TODAY, record: finished(1000) })).status, 201);
    const asQuick = (await board(TODAY, { cookie: quick })).json;
    assert.equal(asQuick.rows.length, 200);
    assert.deepEqual(asQuick.rows[0], { place: 1, name: 'quick', totalMs: 1000, reached: 20, you: true });
  });

  test('300 a minute per address, then 429 rate; other addresses are not held up', async () => {
    assert.equal(BOARD_RATE_LIMIT, 300);
    for (let i = 0; i < 300; i++) assert.equal((await board(TODAY, { ip: '10.9.9.9' })).status, 200, `call ${i + 1}`);
    const res = await board(TODAY, { ip: '10.9.9.9' });
    assert.equal(res.status, 429);
    assert.deepEqual(res.json, { error: 'rate' });
    assert.equal((await board(TODAY, { ip: '10.9.9.8' })).status, 200);
    api.clock.t += 61 * 1000;
    assert.equal((await board(TODAY, { ip: '10.9.9.9' })).status, 200, 'a minute on');
  });
});

describe('the daily table is added to an existing database', () => {
  test('a database made before it opens, keeps its data and takes daily scores', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mathtime-daily-'));
    const file = join(dir, 'old.db');
    try {
      const old = new DatabaseSync(file);
      old.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_lc TEXT NOT NULL UNIQUE,
          pw_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE runs (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL,
          level INTEGER NOT NULL, finished_at TEXT NOT NULL, total_ms INTEGER NOT NULL, misses INTEGER NOT NULL,
          record TEXT NOT NULL, received_at INTEGER NOT NULL, PRIMARY KEY (user_id, id));
        INSERT INTO users VALUES (1, 'Old', 'old', 'x', 0);
        INSERT INTO runs VALUES (1, 'r1', 1, '2026-11-01T00:00:00Z', 40000, 0, '{}', 0);
      `);
      old.close();
      await api.close();
      api = await startApi({ db: openDb(file) });
      assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 1);
      const cookie = await api.signup('sam');
      assert.equal((await post(cookie, { date: TODAY, record: finished(40000) })).status, 201);
      assert.equal(count(), 1);
      await api.close();
      api.db.close();
      api = await startApi({ db: openDb(file) });   // and opening it again changes nothing
      assert.equal(count(), 1);
      await api.close();
      api.db.close();
    } finally {
      api = await startApi();   // for afterEach
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
