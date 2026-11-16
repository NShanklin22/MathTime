import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKey, dayLabel, seeded, dailyProblems, dailyLevel, dailyRecord, ordinal, rowScore, tryScore,
  placeOn, tileParts, resultParts, boardFrom, untilMidnight, createDailyStore, QUESTIONS, IN_PROGRESS,
} from '../../src/daily.js';
import { LEVELS } from '../../src/levels.js';
import { createGame } from '../../src/game.js';

const key = p => `${p.level.n}:${p.a},${p.b}`;

test('the date is the local calendar date, YYYY-MM-DD', () => {
  assert.equal(dateKey(new Date(2026, 10, 14, 23, 59)), '2026-11-14');
  assert.equal(dateKey(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
});

test('the date as shown: "Sat 14 Nov"', () => {
  assert.equal(dayLabel('2026-11-14'), 'Sat 14 Nov');
  assert.equal(dayLabel('2026-01-05'), 'Mon 5 Jan');
});

test('the generator gives the same numbers for the same seed, others for another', () => {
  const a = seeded('2026-11-14'), b = seeded('2026-11-14'), c = seeded('2026-11-15');
  const xs = Array.from({ length: 5 }, a), ys = Array.from({ length: 5 }, b), zs = Array.from({ length: 5 }, c);
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
  for (const x of xs) assert.ok(x >= 0 && x < 1);
});

// Pinned: if the generator, the draw or the shuffle ever changes, every
// browser's 20 for a day change with it, and players on old and new pages
// would play different problems on the same board.
test("2026-11-14's 20 are these, in this order", () => {
  assert.deepEqual(dailyProblems('2026-11-14', LEVELS).map(p => `${p.a} ${p.level.op} ${p.b}`), [
    '2 − 0', '11 − 9', '10 − 7', '7 − 2', '9 × 1', '6 × 2', '0 × 6', '4 − 0', '8 + 2', '9 + 5',
    '11 − 4', '6 + 6', '3 × 2', '4 + 5', '10 − 3', '12 − 5', '7 − 4', '8 × 2', '3 + 2', '4 − 4',
  ]);
});

test('the same date gives the same 20', () => {
  assert.deepEqual(dailyProblems('2026-11-14', LEVELS).map(key), dailyProblems('2026-11-14', LEVELS).map(key));
});

test('different dates give different sets', () => {
  const sets = ['2026-11-14', '2026-11-15', '2026-11-16', '2027-11-14', '2026-12-14'].map(d => dailyProblems(d, LEVELS).map(key).sort().join(' '));
  assert.equal(new Set(sets).size, sets.length);
});

test('5 different facts from each of Levels 1–4, shuffled, each its level\'s', () => {
  for (const date of ['2026-11-14', '2026-02-28', '2030-07-01']) {
    const twenty = dailyProblems(date, LEVELS);
    assert.equal(twenty.length, QUESTIONS);
    assert.equal(new Set(twenty.map(key)).size, QUESTIONS);
    for (const n of [1, 2, 3, 4]) assert.equal(twenty.filter(p => p.level.n === n).length, 5, `level ${n} on ${date}`);
    for (const p of twenty) assert.ok(p.level.facts.some(f => f.a === p.a && f.b === p.b && f.answer === p.answer));
    // Shuffled: not in level order.
    assert.notDeepEqual(twenty.map(p => p.level.n), [...twenty.map(p => p.level.n)].sort());
  }
});

test('the day as a level: the 20 in order, the box for the widest answer', () => {
  const level = dailyLevel('2026-11-14', LEVELS);
  const twenty = dailyProblems('2026-11-14', LEVELS);
  assert.equal(level.label, 'Daily challenge');
  assert.equal(level.problemsPerRun, 20);
  assert.equal(level.livesPerProblem, 3);
  assert.equal(level.maxAnswerLength, Math.max(...twenty.map(p => String(p.answer).length)));
  assert.deepEqual([...level.possibleAnswers].sort(), [...new Set(twenty.map(p => String(p.answer)))].sort());
  const game = createGame(level, () => 0.99);
  const seen = [];
  for (let i = 0; i < 20; i++) {
    seen.push(`${game.state.problem.level.n}:${game.state.problem.a},${game.state.problem.b}`);
    for (const c of String(game.state.problem.answer)) game.press(c);
    game.press('Enter');
    game.next();
  }
  assert.deepEqual(seen, twenty.map(key));
  assert.equal(game.state.phase, 'finished');
});

test('each problem takes only as many digits as its own level does', () => {
  const level = dailyLevel('2026-11-14', LEVELS);
  const game = createGame(level);
  while (game.state.problem.level.maxAnswerLength !== 1) {
    for (const c of String(game.state.problem.answer)) game.press(c);
    game.press('Enter');
    game.next();
  }
  assert.equal(game.press('1'), 'typed');
  assert.equal(game.press('2'), 'ignored');
});

test("typing stops at the day's box: on 2027-06-16 every answer is one digit, an addition's too", () => {
  const level = dailyLevel('2027-06-16', LEVELS);
  assert.equal(level.maxAnswerLength, 1);
  const game = createGame(level);
  while (game.state.problem.level.n !== 1) {
    game.press(String(game.state.problem.answer));
    game.press('Enter');
    game.next();
  }
  assert.equal(game.press('1'), 'typed');
  assert.equal(game.press('2'), 'ignored');
});

test('a finished record has its time and reached 20; an out has neither time nor level', () => {
  const at = new Date('2026-11-14T10:00:00Z');
  const problems = [{ a: 1, b: 2, ms: 1000.4, misses: 1 }, { a: 3, b: 4, ms: 2000, misses: 0 }];
  assert.deepEqual(dailyRecord({ id: 'x', finishedAt: at, out: false, reached: 20, totalMs: 64_200.7, problems }), {
    id: 'x', finishedAt: '2026-11-14T10:00:00.000Z', misses: 1,
    problems: [{ a: 1, b: 2, ms: 1000, misses: 1 }, { a: 3, b: 4, ms: 2000, misses: 0 }],
    daily: true, out: false, reached: 20, totalMs: 64_201,
  });
  const out = dailyRecord({ id: 'y', finishedAt: at, out: true, reached: 2, problems: [...problems, { a: 5, b: 1, ms: 300, misses: 3 }] });
  assert.equal(out.out, true);
  assert.equal(out.reached, 2);
  assert.equal(out.misses, 4);
  assert.ok(!('totalMs' in out));
  assert.ok(!('level' in out));
});

test('places and scores in words', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  assert.equal(rowScore({ totalMs: 64_200, reached: 20 }), '1:04.2');
  assert.equal(rowScore({ totalMs: null, reached: 12 }), 'Out at 12');
  assert.equal(tryScore({ out: true, reached: 12 }), 'Out at 12 of 20');
  assert.equal(tryScore({ out: false, totalMs: 64_200 }), '1:04.2');
});

test('the tile: the date before, the score and place after', () => {
  const rows = [{ place: 1, you: false }, { place: 2 }, { place: 3, you: true }, { place: 4 }, { place: 5 }, { place: 6 }, { place: 7 }];
  assert.deepEqual(placeOn({ rows, total: 7 }), { place: 3, of: 7 });
  assert.equal(placeOn({ rows: rows.map(r => ({ ...r, you: false })), total: 7 }), null);
  // Past the first 200, your own row comes after them, at its real place.
  assert.deepEqual(placeOn({ rows: [{ place: 1 }, { place: 347, you: true }], total: 512 }), { place: 347, of: 512 });
  assert.equal(placeOn(null), null);
  assert.deepEqual(tileParts('2026-11-14', { started: true, ended: false }, null),
    { line: IN_PROGRESS, short: IN_PROGRESS, best: null, label: `Daily challenge: ${IN_PROGRESS}` });
  assert.deepEqual(tileParts('2026-11-14', null, null), {
    line: 'Sat 14 Nov · 20 problems, one try', short: 'Sat 14 Nov · one try', best: null,
    label: 'Daily challenge, Sat 14 Nov: 20 problems, one try',
  });
  assert.deepEqual(tileParts('2026-11-14', { ended: true, out: false, totalMs: 64_200 }, { place: 3, of: 7 }), {
    line: 'Sat 14 Nov · 3rd of 7', short: '3rd of 7', best: '1:04.2',
    label: 'Daily challenge, Sat 14 Nov: 1:04.2, 3rd of 7. Show the board',
  });
  assert.deepEqual(tileParts('2026-11-14', { ended: true, out: true, reached: 12 }, { place: 6, of: 7 }), {
    line: 'Sat 14 Nov · 6th of 7', short: '6th of 7', best: 'Out at 12',
    label: 'Daily challenge, Sat 14 Nov: Out at 12 of 20, 6th of 7. Show the board',
  });
  const signedOut = tileParts('2026-11-14', { ended: true, out: true, reached: 12 }, null);
  assert.deepEqual([signedOut.line, signedOut.short, signedOut.best], ['Sat 14 Nov', 'Sat 14 Nov', 'Out at 12']);
});

test('the result over the board: the time and place, how it went out, or the practice', () => {
  assert.deepEqual(resultParts({ ended: true, out: false, totalMs: 64_200 }, { place: 3, of: 7 }), { title: 'Daily challenge complete', time: '1:04.2', detail: null, place: '3rd of 7' });
  assert.deepEqual(resultParts({ ended: true, out: false, totalMs: 64_200 }, null), { title: 'Daily challenge complete', time: '1:04.2', detail: null, place: null });
  assert.deepEqual(resultParts({ ended: true, out: true, how: 'lives', reached: 5 }, { place: 6, of: 7 }), { title: 'Daily challenge: out', time: null, detail: 'Out of lives at 5', place: '6th of 7' });
  assert.deepEqual(resultParts({ ended: true, out: true, how: 'left', reached: 5 }, null), { title: 'Daily challenge: out', time: null, detail: 'Left at 5', place: null });
  // The server's score, played on another device: how isn't known.
  assert.equal(resultParts({ ended: true, out: true, how: null, reached: 5 }, null).detail, 'Out at 5');
  assert.deepEqual(resultParts({ ended: true }, null, { out: false, totalMs: 7_700 }), { title: 'Practice', time: '0:07.7', detail: null, place: null });
  assert.deepEqual(resultParts({ ended: true }, null, { out: true, reached: 4 }), { title: 'Practice: out at 4', time: null, detail: null, place: null });
  assert.equal(resultParts(null, null), null);
});

test('the board as the API gives it is checked', () => {
  const row = { place: 1, name: 'maya', totalMs: 58_700, reached: 20, you: false };
  const board = boardFrom({ date: 'x', total: 9, rows: [row, { ...row, place: 2, totalMs: null, reached: 5, you: true }] });
  assert.deepEqual(board.rows[1], { place: 2, name: 'maya', totalMs: null, reached: 5, you: true });
  assert.equal(board.total, 9);
  assert.equal(boardFrom({ rows: [row] }).total, 1);
  assert.equal(boardFrom({ rows: [{ ...row, name: 3 }] }), null);
  assert.equal(boardFrom(null), null);
  assert.deepEqual(boardFrom({ rows: [], total: 0 }), { rows: [], total: 0 });
});

function fakeStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), map };
}

test('the store keeps each day\'s try and board, the two latest days', () => {
  const storage = fakeStorage();
  const store = createDailyStore(storage);
  store.set('2026-11-12', { started: true, ended: true });
  store.set('2026-11-13', { started: true, ended: false });
  store.set('2026-11-14', { started: true, ended: false });
  assert.equal(store.get('2026-11-12'), null);
  assert.deepEqual(store.unended().map(u => u.date).sort(), ['2026-11-13', '2026-11-14']);
  assert.deepEqual(createDailyStore(storage).get('2026-11-14'), { started: true, ended: false });
  store.keepBoard('2026-11-14', { rows: [{ place: 1 }], total: 4 }, 'sam');
  assert.deepEqual(createDailyStore(storage).board('2026-11-14', 'sam'), { rows: [{ place: 1 }], total: 4 });
  // Another account's, or signed out, it is not theirs.
  assert.equal(store.board('2026-11-14', 'alex'), null);
  assert.equal(store.board('2026-11-14', null), null);
  assert.equal(store.board('2026-11-13', 'sam'), null);
  store.keepBoard('2026-11-14', { rows: [], total: 0 }, null);
  assert.deepEqual(store.board('2026-11-14', null), { rows: [], total: 0 });
});

test('without storage, the store keeps the day in memory', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  const store = createDailyStore(broken);
  store.set('2026-11-14', { started: true });
  assert.deepEqual(store.get('2026-11-14'), { started: true });
});

test('the next midnight is local, from any time of day', () => {
  assert.equal(untilMidnight(new Date(2026, 10, 14, 23, 59, 30)), 30_000);
  assert.equal(untilMidnight(new Date(2026, 10, 14, 0, 0, 0)), 24 * 3_600_000);
});
