// Runs and best times, per account (accounts spec §5, runs spec §5-§6).
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, record } from './helpers.mjs';

let api;
beforeEach(async () => { api = await startApi(); });
afterEach(() => api.close());

const post = (cookie, body) => api.call('POST', '/api/runs', { cookie, body });
const best = (cookie) => api.call('GET', '/api/best', { cookie });

describe('POST /api/runs', () => {
  test('201 when stored, 200 when that id is already stored for this account, stored once', async () => {
    const cookie = await api.signup('sam');
    const run = record();
    assert.equal((await post(cookie, run)).status, 201);
    assert.equal((await post(cookie, run)).status, 200);
    assert.equal((await post(cookie, { ...run, totalMs: 1 })).status, 200, 'the first copy stands');
    assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 1);
    assert.deepEqual((await best(cookie)).json, { 1: run.totalMs });
  });

  test('keeps the whole record as sent, with whole ms', async () => {
    const cookie = await api.signup('sam');
    const run = record();
    await post(cookie, run);
    const { record: stored } = api.db.prepare('SELECT record FROM runs').get();
    assert.deepEqual(JSON.parse(stored), run);
    assert.equal(run.totalMs, 45000);
  });

  test('401 with no session, and nothing is stored', async () => {
    const res = await post(undefined, record());
    assert.equal(res.status, 401);
    assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 0);
  });

  test('400 for a malformed record', async () => {
    const cookie = await api.signup('sam');
    const good = record();
    const bad = [
      null, [], 'run', 42,
      { ...good, id: undefined }, { ...good, id: '' }, { ...good, id: 'x'.repeat(65) }, { ...good, id: 'a b' },
      { ...good, level: 0 }, { ...good, level: 1.5 }, { ...good, level: '1' },
      { ...good, finishedAt: 'yesterday' }, { ...good, finishedAt: 7 },
      { ...good, totalMs: -1 }, { ...good, totalMs: 1.5 }, { ...good, totalMs: '45000' }, { ...good, totalMs: undefined },
      { ...good, misses: -1 }, { ...good, misses: null },
      { ...good, problems: [] }, { ...good, problems: 'none' }, { ...good, problems: [null] },
      { ...good, problems: [{ a: 1, b: 2, ms: 3 }] }, { ...good, problems: [{ a: '1', b: 2, ms: 3, misses: 0 }] },
      { ...good, problems: [{ a: 1, b: 2, ms: -3, misses: 0 }] },
    ];
    for (const body of bad) {
      const res = await post(cookie, body);
      assert.equal(res.status, 400, JSON.stringify(body)?.slice(0, 80));
    }
    const notJson = await api.call('POST', '/api/runs', { cookie, raw: '{"id":', headers: { 'Content-Type': 'application/json' } });
    assert.equal(notJson.status, 400);
    const empty = await api.call('POST', '/api/runs', { cookie });
    assert.equal(empty.status, 400);
    assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 0);
  });

  test('a column level\'s multi-digit problems are fine', async () => {
    const cookie = await api.signup('sam');
    const run = record({ level: 7, problems: [{ a: 4827, b: 3956, ms: 15000, misses: 2 }] });
    assert.equal((await post(cookie, run)).status, 201);
  });
});

describe('GET /api/best', () => {
  test('each level\'s best total for this account', async () => {
    const cookie = await api.signup('sam');
    assert.deepEqual((await best(cookie)).json, {});
    await post(cookie, record({ level: 1, totalMs: 50000 }));
    await post(cookie, record({ level: 1, totalMs: 41000 }));
    await post(cookie, record({ level: 1, totalMs: 47000 }));
    await post(cookie, record({ level: 12, totalMs: 90000 }));
    const res = await best(cookie);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { 1: 41000, 12: 90000 });
    assert.equal(res.text, '{"1":41000,"12":90000}');
  });

  test('401 with no session', async () => {
    assert.equal((await best()).status, 401);
  });
});

describe('accounts are kept apart', () => {
  test('each account sees only its own runs, and the same id is separate per account', async () => {
    const sam = await api.signup('sam');
    const pat = await api.signup('pat');
    const run = record({ totalMs: 30000 });
    assert.equal((await post(sam, run)).status, 201);
    assert.deepEqual((await best(pat)).json, {});
    assert.equal((await post(pat, { ...run, totalMs: 60000 })).status, 201, 'not the 200 of a duplicate');
    await post(pat, record({ level: 2, totalMs: 20000 }));
    assert.deepEqual((await best(sam)).json, { 1: 30000 });
    assert.deepEqual((await best(pat)).json, { 1: 60000, 2: 20000 });
  });
});
