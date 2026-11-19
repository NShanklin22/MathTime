// Made-up players on the daily board (fake board spec).
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, record } from './helpers.mjs';
import { FAKE_ROWS, fakesFor } from '../fakes.mjs';

const TODAY = '2026-11-09';
const NAME = /^[A-Za-z0-9_-]{3,20}$/;

function finished(totalMs) {
  const { level, ...rest } = record({ totalMs });
  return { ...rest, daily: true, out: false, reached: 20 };
}

describe('fakesFor', () => {
  test('ten a day, the same for the same date, different on another', () => {
    const a = fakesFor(TODAY);
    assert.equal(a.length, FAKE_ROWS);
    assert.deepEqual(fakesFor(TODAY), a);
    assert.notDeepEqual(fakesFor('2026-11-10'), a);
  });

  test('names sign-up would allow, all different; scores in the spec\'s ranges, best first', () => {
    for (const date of ['2026-11-09', '2026-12-25', '2027-03-01']) {
      const rows = fakesFor(date);
      assert.equal(new Set(rows.map((r) => r.name.toLowerCase())).size, rows.length);
      for (const r of rows) assert.match(r.name, NAME);
      const times = rows.filter((r) => !r.out).map((r) => r.total_ms);
      assert.equal(times.length, 8);
      assert.ok(times[0] >= 58_000 && times[0] < 71_000);
      assert.ok(times.slice(1).every((t) => t >= 75_000 && t < 241_000));
      assert.equal(new Set(times.map((t) => Math.floor(t / 100) % 10)).size, 8);
      assert.deepEqual(times, [...times].sort((x, y) => x - y));
      const outs = rows.slice(8);
      assert.ok(outs.every((r) => r.out === 1 && r.total_ms === null && r.reached >= 4 && r.reached <= 17));
      assert.ok(outs[0].reached >= outs[1].reached);
    }
  });

  test('a taken name changes only its own row: same score, a spare name', () => {
    const before = fakesFor(TODAY);
    const gone = before[3].name;
    const after = fakesFor(TODAY, new Set([gone.toLowerCase()]));
    after.forEach((r, i) => {
      assert.equal(r.total_ms, before[i].total_ms);
      assert.equal(r.reached, before[i].reached);
      if (i !== 3) assert.equal(r.name, before[i].name);
    });
    assert.ok(!before.some((r) => r.name === after[3].name));
  });

  test('a name a real account holds, in any case, is never used', () => {
    const first = fakesFor(TODAY)[0].name;
    const rows = fakesFor(TODAY, new Set([first.toLowerCase()]));
    assert.equal(rows.length, FAKE_ROWS);
    assert.ok(!rows.some((r) => r.name.toLowerCase() === first.toLowerCase()));
  });
});

describe('the board with made-up players', () => {
  let api;
  beforeEach(async () => { api = await startApi({ fakeRows: FAKE_ROWS }); });
  afterEach(() => api.close());
  const board = (opts) => api.call('GET', `/api/daily/${TODAY}`, opts);
  const play = async (name, totalMs) => {
    const cookie = await api.signup(name);
    const res = await api.call('POST', '/api/daily', { cookie, body: { date: TODAY, record: finished(totalMs) } });
    assert.equal(res.status, 201);
    return cookie;
  };

  test('with no one played, the ten made-up players, looking like anyone else', async () => {
    const res = await board();
    assert.equal(res.json.total, FAKE_ROWS);
    assert.equal(res.json.rows.length, FAKE_ROWS);
    const fakes = fakesFor(TODAY);
    res.json.rows.forEach((r, i) => {
      assert.deepEqual(Object.keys(r).sort(), ['name', 'place', 'reached', 'totalMs', 'you']);
      assert.equal(r.name, fakes[i].name);
      assert.equal(r.you, false);
      assert.equal(r.place, i + 1);
    });
  });

  test('each real score pushes the worst made-up player off; the real one ranks among them', async () => {
    const fakes = fakesFor(TODAY);
    const cookie = await play('sam', 72_000);   // between the fast one and the middling ones
    const res = await board({ cookie });
    assert.equal(res.json.total, FAKE_ROWS);
    const names = res.json.rows.map((r) => r.name);
    assert.deepEqual(names, [fakes[0].name, 'sam', ...fakes.slice(1, 9).map((f) => f.name)]);
    assert.ok(!names.includes(fakes[9].name));
    assert.deepEqual(res.json.rows[1], { place: 2, name: 'sam', totalMs: 72_000, reached: 20, you: true });
  });

  test('with ten real scores no made-up player is left', async () => {
    for (let i = 0; i < FAKE_ROWS; i++) await play(`player${i}`, 300_000 + i * 1000);
    const res = await board();
    assert.equal(res.json.total, FAKE_ROWS);
    assert.ok(res.json.rows.every((r) => r.name.startsWith('player')));
  });

  test('a real score below every made-up one pushes off the worst made-up out and sits last', async () => {
    const fakes = fakesFor(TODAY);
    const cookie = await api.signup('sam');
    const { level, totalMs, ...rest } = record();
    const res = await api.call('POST', '/api/daily', { cookie, body: { date: TODAY, record: { ...rest, problems: rest.problems.slice(0, 2), daily: true, out: true, reached: 2 } } });
    assert.equal(res.status, 201);
    const rows = (await board()).json.rows;
    assert.deepEqual(rows.map((r) => r.name), [...fakes.slice(0, 9).map((f) => f.name), 'sam']);
    assert.equal(rows[9].place, 10);
  });

  test('none on a date past tomorrow', async () => {
    const res = await api.call('GET', '/api/daily/2026-11-11');
    assert.equal(res.json.total, 0);
    assert.equal((await api.call('GET', '/api/daily/2026-11-10')).json.total, FAKE_ROWS);
  });

  test('a real player ties above a made-up one', async () => {
    const top = fakesFor(TODAY)[0];
    await play('sam', top.total_ms);
    const rows = (await board()).json.rows;
    assert.deepEqual(rows.slice(0, 2).map((r) => [r.name, r.place]), [['sam', 1], [top.name, 1]]);
  });

  test('a made-up name a real player signs up with is replaced', async () => {
    const taken = fakesFor(TODAY)[3].name;
    await api.signup(taken.toUpperCase());
    const rows = (await board()).json.rows;
    assert.equal(rows.length, FAKE_ROWS);
    assert.ok(!rows.some((r) => r.name === taken));
  });
});
