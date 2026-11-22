// The crowd on the daily board (crowd spec).
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, record } from './helpers.mjs';
import { CROWD_BASE, PER_ACCOUNT, SHOWN, crowdSize, crowdFor, crowdBetter, crowdTop } from '../crowd.mjs';

const TODAY = '2026-11-09';
const NAME = /^[A-Za-z0-9_-]{3,20}$/;

function finished(totalMs) {
  const { level, ...rest } = record({ totalMs });
  return { ...rest, daily: true, out: false, reached: 20 };
}
function outAt(reached) {
  const { level, totalMs, ...rest } = record();
  return { ...rest, problems: rest.problems.slice(0, reached), daily: true, out: true, reached };
}

describe('crowdFor', () => {
  test('the same for the same date and size, different on another date', () => {
    const a = crowdFor(TODAY, 10_000);
    assert.deepEqual(crowdFor(TODAY, 10_000), a);
    assert.notDeepEqual(crowdFor('2026-11-10', 10_000).times.slice(0, 10), a.times.slice(0, 10));
  });

  test('a name stays with its player when a bigger crowd puts someone faster above', () => {
    for (const date of ['2026-11-09', '2026-11-18', '2026-12-25', '2027-03-01']) {
      const named = (c) => new Map(crowdTop(c).map((r) => [r.total_ms, r.name]));
      const small = named(crowdFor(date, 10_000));
      const big = named(crowdFor(date, 12_000));
      for (const [t, name] of big) if (small.has(t)) assert.equal(name, small.get(t), `${date} ${t}`);
    }
  });

  test('a bigger crowd keeps the same players and adds more', () => {
    const small = crowdFor(TODAY, 10_000);
    const big = crowdFor(TODAY, 10_100);
    const outs = (c) => c.outsAt.reduce((x, y) => x + y, 0);
    assert.equal(big.times.length + outs(big), 10_100);
    assert.ok(small.times.every((t) => big.times.includes(t)));
    small.outsAt.forEach((n, r) => assert.ok(big.outsAt[r] >= n));
  });

  test('times as the spec has them: median near 2:30, the best ten near 0:35-0:55, about 12% out', () => {
    for (const date of ['2026-11-09', '2026-12-25', '2027-03-01']) {
      const { times, outsAt } = crowdFor(date, 10_000);
      const outs = outsAt.reduce((x, y) => x + y, 0);
      assert.ok(outs > 1_000 && outs < 1_400, `outs ${outs}`);
      assert.ok(outsAt[0] === 0 && outsAt[1] === 0 && outsAt[20] === 0);
      const median = times[times.length >> 1];
      assert.ok(median > 145_000 && median < 155_000, `median ${median}`);
      assert.ok(times[0] >= 30_000 && times[0] < 42_000, `best ${times[0]}`);
      assert.ok(times[9] > 38_000 && times[9] < 56_000, `tenth ${times[9]}`);
      assert.deepEqual(times, [...times].sort((x, y) => x - y));
    }
  });

  test('crowdSize: 10,000 and 100 an account', () => {
    assert.equal(crowdSize(0), CROWD_BASE);
    assert.equal(crowdSize(3), CROWD_BASE + 3 * PER_ACCOUNT);
  });
});

describe('crowdBetter', () => {
  const crowd = { size: 6, times: [40_000, 50_000, 50_000, 90_000], outsAt: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0] };
  test('counts only strictly better scores', () => {
    assert.equal(crowdBetter(crowd, { out: 0, total_ms: 30_000 }), 0);
    assert.equal(crowdBetter(crowd, { out: 0, total_ms: 50_000 }), 1);
    assert.equal(crowdBetter(crowd, { out: 0, total_ms: 50_001 }), 3);
    assert.equal(crowdBetter(crowd, { out: 0, total_ms: 99_000 }), 4);
    assert.equal(crowdBetter(crowd, { out: 1, reached: 19 }), 4);
    assert.equal(crowdBetter(crowd, { out: 1, reached: 10 }), 5);
    assert.equal(crowdBetter(crowd, { out: 1, reached: 2 }), 6);
  });
});

describe('crowdTop', () => {
  const crowd = crowdFor(TODAY, 10_000);
  test('the ten best, with names sign-up would allow, all different', () => {
    const rows = crowdTop(crowd);
    assert.equal(rows.length, SHOWN);
    assert.deepEqual(rows.map((r) => r.total_ms), crowd.times.slice(0, SHOWN));
    assert.equal(new Set(rows.map((r) => r.name.toLowerCase())).size, SHOWN);
    for (const r of rows) assert.match(r.name, NAME);
  });

  test('a taken name, in any case, changes only its own row', () => {
    const before = crowdTop(crowd);
    const gone = before[3].name;
    const after = crowdTop(crowd, new Set([gone.toLowerCase()]));
    after.forEach((r, i) => { if (i !== 3) assert.equal(r.name, before[i].name); });
    assert.ok(!before.some((r) => r.name === after[3].name));
  });
});

describe('the board with the crowd', () => {
  let api;
  beforeEach(async () => { api = await startApi({ crowd: true }); });
  afterEach(() => api.close());
  const board = (opts) => api.call('GET', `/api/daily/${TODAY}`, opts);
  const play = async (name, rec) => {
    const cookie = await api.signup(name);
    const res = await api.call('POST', '/api/daily', { cookie, body: { date: TODAY, record: rec } });
    assert.equal(res.status, 201);
    return cookie;
  };

  test('with no one, 10,000 played and the crowd\'s best ten', async () => {
    const res = await board();
    assert.equal(res.json.total, CROWD_BASE);
    const top = crowdTop(crowdFor(TODAY, CROWD_BASE));
    assert.deepEqual(res.json.rows.map((r) => r.name), top.map((r) => r.name));
    assert.deepEqual(res.json.rows.map((r) => r.place), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(res.json.rows.every((r) => r.you === false));
  });

  test('a slow player is not in the ten: their own row, last, at their place in the crowd', async () => {
    const cookie = await play('newbie', finished(120_000));
    const res = await board({ cookie });
    assert.equal(res.json.total, crowdSize(1) + 1);
    assert.equal(res.json.rows.length, SHOWN + 1);
    const mine = res.json.rows.at(-1);
    assert.equal(mine.you, true);
    assert.equal(mine.place, 1 + crowdBetter(crowdFor(TODAY, crowdSize(1)), { out: 0, total_ms: 120_000 }));
    assert.ok(mine.place > 1_000 && mine.place < 5_000, `place ${mine.place}`);
  });

  test('an out has its place after every finisher in the crowd', async () => {
    const cookie = await play('outfirst', outAt(10));
    const mine = (await board({ cookie })).json.rows.at(-1);
    const crowd = crowdFor(TODAY, crowdSize(1));
    assert.equal(mine.totalMs, null);
    assert.ok(mine.place > crowd.times.length);
    assert.equal(mine.place, 1 + crowdBetter(crowd, { out: 1, reached: 10 }));
  });

  test('a real player faster than the crowd tops the board, and the crowd moves down one', async () => {
    const cookie = await play('speedy', finished(20_000));
    const res = await board({ cookie });
    assert.equal(res.json.rows.length, SHOWN);
    assert.deepEqual(res.json.rows[0], { place: 1, name: 'speedy', totalMs: 20_000, reached: 20, you: true });
    assert.deepEqual(res.json.rows.map((r) => r.place), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('two real players count each other: the slower one\'s place is one more', async () => {
    const a = await play('alpha', finished(100_000));
    const b = await play('bravo', finished(110_000));
    const crowd = crowdFor(TODAY, crowdSize(2));
    const placeB = (await board({ cookie: b })).json.rows.at(-1).place;
    assert.equal(placeB, 2 + crowdBetter(crowd, { out: 0, total_ms: 110_000 }));
    const placeA = (await board({ cookie: a })).json.rows.at(-1).place;
    assert.equal(placeA, 1 + crowdBetter(crowd, { out: 0, total_ms: 100_000 }));
  });

  test('a tie with the crowd: the real player is listed first, at the same place', async () => {
    const tenth = crowdFor(TODAY, crowdSize(1)).times[4];
    await play('tiegame', finished(tenth));
    const rows = (await board()).json.rows;
    const i = rows.findIndex((r) => r.name === 'tiegame');
    assert.equal(rows[i + 1].totalMs, tenth);
    assert.equal(rows[i].place, rows[i + 1].place);
  });

  test('no crowd on a date past tomorrow', async () => {
    const res = await api.call('GET', '/api/daily/2026-11-11');
    assert.deepEqual(res.json, { date: '2026-11-11', total: 0, rows: [] });
  });
});
