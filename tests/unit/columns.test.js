import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMN_ADD, COLUMN_SUB } from '../../src/columns.js';
import { LEVEL6 } from '../../src/level6.js';
import { LEVEL7 } from '../../src/level7.js';
import { LEVEL1 } from '../../src/level1.js';
import { createGame } from '../../src/game.js';

// An rng that returns the given values in order, then repeats them.
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};
// The rng value that draws the `i`th (from 0) of `n` facts.
const nth = (i, n) => (i + 0.5) / n;
// A seeded rng (mulberry32), so a test of chances is the same on every run.
const seeded = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Level 6 carries in the ones; Level 7 borrows for them.
const carries = f => f.a % 10 + f.b % 10 >= 10;
const borrows = f => f.a % 10 < f.b % 10;

const fact = (level, a, b) => {
  const found = level.facts.find(f => f.a === a && f.b === b);
  assert.ok(found, `${a}, ${b} is a fact of Level ${level.n}`);
  return found;
};
// A game of `level` whose problems are these, asked in this order.
const playing = (level, ...pairs) =>
  createGame({ ...level, facts: pairs.map(([a, b]) => fact(level, a, b)), pick: () => 0 });
// Press each key in turn; returns what each did.
const keys = (game, ...ks) => ks.map(k => game.press(k));

// Write the working of the problem on screen, right, a column at a time:
// in each column the digit, then the carry or borrow where there is one.
// Returns what each Enter did.
const work = (game) => {
  const { x } = game.state;
  if (game.level.method === COLUMN_ADD) {
    return [
      ...keys(game, String(x.O), ...(x.C ? ['1'] : []), 'Enter'),
      ...keys(game, String(x.T), ...(x.H ? ['1'] : []), 'Enter'),
    ].filter(r => r !== 'typed');
  }
  return [
    ...keys(game, ...(x.need ? ['ArrowUp', String(x.B)] : []), String(x.O), 'Enter'),
    ...keys(game, String(x.T), 'Enter'),
  ].filter(r => r !== 'typed' && r !== 'moved');
};

// A wrong check, whatever the problem and wherever the cursor: a wrong ones digit.
const missOnes = (game) => {
  game.tap('O');
  game.press(String((game.state.x.O + 1) % 10));
  return game.press('Enter');
};

// Whatever the player presses or taps, a locked game ignores it and changes nothing.
const assertLocked = (game) => {
  const before = structuredClone(game.state);
  for (const key of ['0', '1', '5', '9', 'Enter', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    assert.equal(game.press(key), 'ignored', `'${key}' should be ignored`);
  }
  for (const id of ['H', 'T', 'O', 'C', 'B']) assert.equal(game.tap(id), 'ignored', `tap '${id}' should be ignored`);
  assert.deepEqual(game.state, before);
};

/* ---------- The methods ---------- */

test('Level 6 works a + b out a column at a time: the ones, the carry, the tens, the hundreds', () => {
  const { solve } = COLUMN_ADD;
  assert.deepEqual(solve(47, 38), { O: 5, C: 1, T: 8, H: 0 });     // a carry
  assert.deepEqual(solve(75, 38), { O: 3, C: 1, T: 1, H: 1 });     // a carry and a hundreds
  assert.deepEqual(solve(23, 41), { O: 4, C: 0, T: 6, H: 0 });     // no carry
  assert.deepEqual(solve(56, 71), { O: 7, C: 0, T: 2, H: 1 });     // a hundreds without a carry
  assert.deepEqual(solve(68, 32), { O: 0, C: 1, T: 0, H: 1 });     // a carry that makes a 0 in the tens
  for (const { a, b, answer } of LEVEL6.facts) {
    const x = solve(a, b);
    assert.equal(x.H * 100 + x.T * 10 + x.O, answer, `${a} + ${b}`);
    assert.equal(x.C, carries({ a, b }) ? 1 : 0, `${a} + ${b}`);
  }
});

test('Level 7 works a − b out a column at a time: whether to borrow, the new tens digit, the ones, the tens', () => {
  const { solve } = COLUMN_SUB;
  assert.deepEqual(solve(52, 27), { need: true, B: 4, O: 5, T: 2 });
  assert.deepEqual(solve(86, 34), { need: false, B: 7, O: 2, T: 5 });   // no borrow
  assert.deepEqual(solve(70, 26), { need: true, B: 6, O: 4, T: 4 });    // a borrow from a 0 in the ones
  assert.deepEqual(solve(41, 38), { need: true, B: 3, O: 3, T: 0 });    // a borrow that leaves 0 tens
  for (const { a, b, answer } of LEVEL7.facts) {
    const x = solve(a, b);
    assert.equal(x.T * 10 + x.O, answer, `${a} − ${b}`);
    assert.equal(x.need, borrows({ a, b }), `${a} − ${b}`);
    for (const d of [x.B, x.O, x.T]) assert.ok(Number.isInteger(d) && 0 <= d && d <= 9, `${a} − ${b}`);
  }
});

test('each method\'s cells are its answer digits and its carry or borrow, each named for screen readers', () => {
  assert.deepEqual(COLUMN_ADD.cells, [
    { id: 'H', kind: 'big', col: 0, opt: true, name: 'Hundreds, answer' },
    { id: 'T', kind: 'big', col: 1, name: 'Tens, answer' },
    { id: 'O', kind: 'big', col: 2, name: 'Ones, answer' },
    { id: 'C', kind: 'small', col: 1, name: 'Tens, carry' },
  ]);
  assert.deepEqual(COLUMN_SUB.cells, [
    { id: 'T', kind: 'big', col: 1, name: 'Tens, answer' },
    { id: 'O', kind: 'big', col: 2, name: 'Ones, answer' },
    { id: 'B', kind: 'small', col: 1, name: 'Tens, borrow: the new tens digit' },
  ]);
  assert.deepEqual(COLUMN_ADD.steps.map(s => [s.name, s.cells]), [['Ones', ['O', 'C']], ['Tens', ['T', 'H']]]);
  assert.deepEqual(COLUMN_SUB.steps.map(s => [s.name, s.cells]), [['Ones', ['O', 'B']], ['Tens', ['T']]]);
});

/* ---------- Picking the problems ---------- */

test('Level 6 draws a carry or not first, half and half, then a fact of that kind, evenly', () => {
  const yes = LEVEL6.facts.filter(carries), no = LEVEL6.facts.filter(f => !carries(f));
  assert.equal(yes.length, 3645);
  // rng() below 0.5 draws a carry; the next value then picks among the carries.
  const drawn = (first, i, n) => LEVEL6.facts[LEVEL6.pick(LEVEL6.facts, seq(first, nth(i, n)))];
  assert.deepEqual(yes.map((_, i) => drawn(0.25, i, yes.length)), yes);
  assert.deepEqual(no.map((_, i) => drawn(0.75, i, no.length)), no);
  assert.deepEqual(drawn(0.4999, 0, yes.length), { a: 11, b: 19, answer: 30 });
  assert.deepEqual(drawn(0.5, 0, no.length), { a: 10, b: 10, answer: 20 });
});

test('Level 7 draws a borrow or not first, half and half, then a fact of that kind, evenly', () => {
  const yes = LEVEL7.facts.filter(borrows), no = LEVEL7.facts.filter(f => !borrows(f));
  assert.equal(yes.length, 1620);
  const drawn = (first, i, n) => LEVEL7.facts[LEVEL7.pick(LEVEL7.facts, seq(first, nth(i, n)))];
  assert.deepEqual(yes.map((_, i) => drawn(0.25, i, yes.length)), yes);
  assert.deepEqual(no.map((_, i) => drawn(0.75, i, no.length)), no);
  assert.deepEqual(drawn(0.25, 0, yes.length), { a: 20, b: 11, answer: 9 });
});

test('half the problems drawn carry or borrow, though fewer than half the facts do', () => {
  for (const [level, needs, share] of [[LEVEL6, carries, 0.45], [LEVEL7, borrows, 1620 / 4095]]) {
    assert.ok(Math.abs(level.facts.filter(needs).length / level.facts.length - share) < 1e-9);
    const rng = seeded(level.n);
    let need = 0;
    for (let i = 0; i < 4000; i++) if (needs(level.facts[level.pick(level.facts, rng)])) need += 1;
    // 2000 expected, with a spread of about 32; drawing evenly from the facts would give 1800 or fewer.
    assert.ok(Math.abs(need - 2000) < 100, `Level ${level.n}: ${need} of 4000`);
  }
});

test('when none of the kind drawn is left, the problem is one of the other kind', () => {
  const yes = LEVEL6.facts.filter(carries), no = LEVEL6.facts.filter(f => !carries(f)).slice(0, 5);
  assert.equal(LEVEL6.pick(no, seq(0.25, nth(3, 5))), 3);
  assert.equal(LEVEL6.pick(yes.slice(0, 4), seq(0.75, nth(2, 4))), 2);
  const sub = LEVEL7.facts.filter(f => !borrows(f)).slice(0, 2);
  assert.equal(LEVEL7.pick(sub, seq(0.25, nth(1, 2))), 1);
});

test('a column level\'s game draws its problems with the level\'s pick, from the facts not yet asked', () => {
  const n = LEVEL6.facts.filter(carries).length;
  const game = createGame(LEVEL6, seq(0.25, nth(0, n), 0.25, nth(0, n - 1)));
  assert.deepEqual(game.state.problem, { a: 11, b: 19, answer: 30 });
  work(game);
  game.next();
  assert.deepEqual(game.state.problem, { a: 11, b: 29, answer: 40 });
});

test('a run of either column level is 20 different problems, and the 20th right finishes it', () => {
  for (const level of [LEVEL6, LEVEL7]) {
    const game = createGame(level);
    const asked = [];
    for (let q = 1; q <= 20; q++) {
      assert.equal(game.state.question, q);
      asked.push(game.state.problem);
      assert.deepEqual(work(game), ['step', q < 20 ? 'correct' : 'finished'], `Level ${level.n}, question ${q}`);
      game.next();
    }
    assert.equal(new Set(asked.map(p => `${p.a} ${p.b}`)).size, 20);
    for (const p of asked) assert.equal(fact(level, p.a, p.b).answer, p.answer);
    assert.equal(game.state.phase, 'finished');
    assert.equal(game.result.level, level.n);
    assert.equal(game.result.problems.length, 20);
    assert.equal(game.result.misses, 0);
  }
});

/* ---------- Writing a column ---------- */

test('a problem starts on the ones answer, every cell empty, nothing checked', () => {
  const add = playing(LEVEL6, [47, 38]);
  assert.deepEqual(add.state.problem, { a: 47, b: 38, answer: 85 });
  assert.deepEqual(add.state.x, { O: 5, C: 1, T: 8, H: 0 });
  assert.deepEqual(add.state.cells, { H: '', T: '', O: '', C: '' });
  assert.equal(add.state.step, 0);
  assert.equal(add.state.focus, 'O');
  assert.deepEqual(add.state.done, [false, false]);
  assert.deepEqual(add.state.bad, []);
  assert.equal(add.state.lives, 3);
  assert.equal(add.state.phase, 'playing');
  const sub = playing(LEVEL7, [52, 27]);
  assert.deepEqual(sub.state.x, { need: true, B: 4, O: 5, T: 2 });
  assert.deepEqual(sub.state.cells, { T: '', O: '', B: '' });
  assert.equal(sub.state.focus, 'O');
});

test('Level 6: the ones digit, then the carry; once the column is written the cursor hides', () => {
  const game = playing(LEVEL6, [47, 38]);
  assert.equal(game.press('5'), 'typed');
  assert.equal(game.state.cells.O, '5');
  assert.equal(game.state.focus, 'C');
  assert.equal(game.press('1'), 'typed');
  assert.equal(game.state.cells.C, '1');
  assert.equal(game.state.focus, null);
  // With no cell under the cursor, a digit goes nowhere.
  assert.equal(game.press('7'), 'ignored');
  assert.deepEqual(game.state.cells, { H: '', T: '', O: '5', C: '1' });
});

test('Level 6: a right column locks, and the cursor moves to the next column\'s digit', () => {
  const game = playing(LEVEL6, [47, 38]);
  keys(game, '5', '1');
  assert.equal(game.press('Enter'), 'step');
  assert.deepEqual(game.state.done, [true, false]);
  assert.equal(game.state.step, 1);
  assert.equal(game.state.focus, 'T');
  assert.deepEqual(game.state.bad, []);
  assert.equal(game.state.lives, 3);
  assert.equal(game.state.solved, 0);
  // The tens digit, then the hundreds: the carry out of the tens goes straight into it.
  assert.equal(game.press('8'), 'typed');
  assert.equal(game.state.focus, 'H');
});

test('a digit typed over a written one replaces it, and the cursor goes to the next empty cell', () => {
  const game = playing(LEVEL6, [47, 38]);
  keys(game, '4', 'ArrowDown');
  assert.equal(game.state.focus, 'O');
  assert.equal(game.press('5'), 'typed');
  assert.equal(game.state.cells.O, '5');
  assert.equal(game.state.focus, 'C');
  // From the carry, the next empty cell is back round at the ones.
  const round = playing(LEVEL6, [47, 38]);
  keys(round, 'ArrowUp', '1');
  assert.equal(round.state.focus, 'O');
});

test('a carry of 0 may be written or left out; a 0 in the hundreds too', () => {
  const left = playing(LEVEL6, [23, 41]);
  keys(left, '4');
  assert.equal(left.press('Enter'), 'step');
  const written = playing(LEVEL6, [23, 41]);
  keys(written, '4', '0');
  assert.equal(written.press('Enter'), 'step');
  keys(written, '6', '0');
  assert.equal(written.press('Enter'), 'correct');
});

test('Level 7: with no borrow, the ones digit alone writes the column', () => {
  const game = playing(LEVEL7, [86, 34]);
  assert.equal(game.press('2'), 'typed');
  assert.equal(game.state.focus, null);
  assert.equal(game.press('Enter'), 'step');
  assert.equal(game.state.focus, 'T');
  assert.equal(game.press('5'), 'typed');
  assert.equal(game.state.focus, null);
  assert.equal(game.press('Enter'), 'correct');
});

test('Level 7: Up borrows; the new tens digit, then the ones', () => {
  const game = playing(LEVEL7, [52, 27]);
  assert.equal(game.press('ArrowUp'), 'moved');
  assert.equal(game.state.focus, 'B');
  assert.equal(COLUMN_SUB.borrowed(game.state.cells, game.state.focus), true);
  assert.equal(game.press('4'), 'typed');
  assert.equal(game.state.focus, 'O');
  assert.equal(game.press('5'), 'typed');
  assert.equal(game.state.focus, null);
  assert.equal(game.press('Enter'), 'step');
  assert.deepEqual(game.state.cells, { T: '', O: '5', B: '4' });
  keys(game, '2');
  assert.equal(game.press('Enter'), 'correct');
});

test('a borrow cell visited and left empty is no borrow', () => {
  const game = playing(LEVEL7, [86, 34]);
  keys(game, '2', 'ArrowUp');
  assert.equal(game.state.focus, 'B');
  assert.equal(game.press('Enter'), 'step');
  assert.equal(game.state.lives, 3);
});

/* ---------- Checking a column ---------- */

test('Enter with the column\'s answer digit empty does nothing and costs no life', () => {
  const add = playing(LEVEL6, [47, 38]);
  keys(add, 'ArrowUp', '1');
  assert.equal(add.press('Enter'), 'ignored');
  assert.equal(add.state.lives, 3);
  const sub = playing(LEVEL7, [52, 27]);
  keys(sub, 'ArrowUp', '4', 'ArrowUp');
  assert.equal(sub.state.focus, 'B');
  assert.equal(sub.press('Enter'), 'ignored');
  assert.equal(sub.state.lives, 3);
});

test('a skipped carry is wrong: the right ones digit stays, and the cursor goes to the carry', () => {
  const game = playing(LEVEL6, [47, 38]);
  keys(game, '5');
  assert.equal(game.press('Enter'), 'wrong');
  assert.equal(game.state.lives, 2);
  assert.deepEqual(game.state.bad, ['C']);
  assert.deepEqual(game.state.cells, { H: '', T: '', O: '5', C: '' });
  assert.equal(game.state.focus, 'C');
  assert.equal(game.state.step, 0);
  assert.deepEqual(game.state.done, [false, false]);
  assert.equal(game.state.phase, 'playing');
  // Then the carry, and the column is right.
  keys(game, '1');
  assert.equal(game.press('Enter'), 'step');
  assert.deepEqual(game.state.bad, []);
});

test('a carry where there is none is wrong too; a wrong digit and carry both clear, the cursor on the digit', () => {
  const extra = playing(LEVEL6, [23, 41]);
  keys(extra, '4', '1');
  assert.equal(extra.press('Enter'), 'wrong');
  assert.deepEqual(extra.state.bad, ['C']);
  assert.deepEqual(extra.state.cells, { H: '', T: '', O: '4', C: '' });
  const both = playing(LEVEL6, [47, 38]);
  keys(both, '4', '0');
  assert.equal(both.press('Enter'), 'wrong');
  assert.deepEqual(both.state.bad, ['O', 'C']);
  assert.deepEqual(both.state.cells, { H: '', T: '', O: '', C: '' });
  assert.equal(both.state.focus, 'O');
});

test('a wrong tens digit clears it and keeps a right hundreds; a missed hundreds is wrong', () => {
  const game = playing(LEVEL6, [75, 38]);
  keys(game, '3', '1', 'Enter', '2', '1');
  assert.equal(game.press('Enter'), 'wrong');
  assert.deepEqual(game.state.bad, ['T']);
  assert.deepEqual(game.state.cells, { H: '1', T: '', O: '3', C: '1' });
  assert.equal(game.state.focus, 'T');
  assert.equal(game.state.lives, 2);
  keys(game, '1');
  assert.equal(game.state.focus, null);
  assert.equal(game.press('Enter'), 'correct');

  const missed = playing(LEVEL6, [75, 38]);
  keys(missed, '3', '1', 'Enter', '1');
  assert.equal(missed.press('Enter'), 'wrong');
  assert.deepEqual(missed.state.bad, ['H']);
  assert.equal(missed.state.cells.T, '1');
  assert.equal(missed.state.focus, 'H');
});

test('Level 7: a missing borrow is wrong; the ones digit stays and the cursor goes into the borrow cell', () => {
  const game = playing(LEVEL7, [52, 27]);
  keys(game, '5');
  assert.equal(game.press('Enter'), 'wrong');
  assert.equal(game.state.lives, 2);
  assert.deepEqual(game.state.bad, ['B']);
  assert.deepEqual(game.state.cells, { T: '', O: '5', B: '' });
  assert.equal(game.state.focus, 'B');
  // The borrow is started: the tens digit is struck through.
  assert.equal(COLUMN_SUB.borrowed(game.state.cells, game.state.focus), true);
  keys(game, '4');
  assert.equal(game.state.focus, null);
  assert.equal(game.press('Enter'), 'step');
});

test('Level 7: a missing borrow and a wrong ones digit clear both; the cursor goes into the borrow cell', () => {
  const game = playing(LEVEL7, [52, 27]);
  keys(game, '6');
  assert.equal(game.press('Enter'), 'wrong');
  assert.deepEqual(game.state.bad, ['B', 'O']);
  assert.deepEqual(game.state.cells, { T: '', O: '', B: '' });
  assert.equal(game.state.focus, 'B');
});

test('Level 7: a wrong new tens digit clears it; the ones digit, if right, stays', () => {
  const game = playing(LEVEL7, [52, 27]);
  keys(game, 'ArrowUp', '3', '5');
  assert.equal(game.press('Enter'), 'wrong');
  assert.deepEqual(game.state.bad, ['B']);
  assert.deepEqual(game.state.cells, { T: '', O: '5', B: '' });
  assert.equal(game.state.focus, 'B');
  const both = playing(LEVEL7, [52, 27]);
  keys(both, 'ArrowUp', '3', '6');
  assert.equal(both.press('Enter'), 'wrong');
  assert.deepEqual(both.state.bad, ['B', 'O']);
  assert.deepEqual(both.state.cells, { T: '', O: '', B: '' });
  assert.equal(both.state.focus, 'B');
});

test('Level 7: a borrow not needed is wrong and taken back; the cursor on the ones digit if it is wrong, else hidden', () => {
  const right = playing(LEVEL7, [86, 34]);
  keys(right, 'ArrowUp', '7', '2');
  assert.equal(right.press('Enter'), 'wrong');
  assert.equal(right.state.lives, 2);
  assert.deepEqual(right.state.bad, ['B']);
  assert.deepEqual(right.state.cells, { T: '', O: '2', B: '' });
  assert.equal(right.state.focus, null);
  assert.equal(COLUMN_SUB.borrowed(right.state.cells, right.state.focus), false);
  assert.deepEqual(COLUMN_SUB.afterWrong(0, ['B'], right.state.x), { focus: null, what: 'no borrow needed' });
  assert.equal(right.press('Enter'), 'step');

  const wrong = playing(LEVEL7, [86, 34]);
  keys(wrong, 'ArrowUp', '7', '3');
  assert.equal(wrong.press('Enter'), 'wrong');
  assert.deepEqual(wrong.state.bad, ['B', 'O']);
  assert.deepEqual(wrong.state.cells, { T: '', O: '', B: '' });
  assert.equal(wrong.state.focus, 'O');
  assert.equal(COLUMN_SUB.borrowed(wrong.state.cells, wrong.state.focus), false);
});

test('Level 7: a wrong tens digit clears it, and 0 tens is written as 0', () => {
  const game = playing(LEVEL7, [41, 38]);
  keys(game, 'ArrowUp', '3', '3', 'Enter', '1');
  assert.equal(game.press('Enter'), 'wrong');
  assert.deepEqual(game.state.bad, ['T']);
  assert.equal(game.state.cells.T, '');
  assert.equal(game.state.focus, 'T');
  keys(game, '0');
  assert.equal(game.press('Enter'), 'correct');
});

/* ---------- Backspace ---------- */

test('Backspace clears the digit under the cursor, and the cursor stays', () => {
  const game = playing(LEVEL6, [47, 38]);
  keys(game, '5', 'ArrowDown');
  assert.equal(game.press('Backspace'), 'typed');
  assert.deepEqual(game.state.cells, { H: '', T: '', O: '', C: '' });
  assert.equal(game.state.focus, 'O');
});

test('Backspace on an empty cell clears the cell before it in working order, and goes there', () => {
  const game = playing(LEVEL6, [47, 38]);
  keys(game, '5');
  assert.equal(game.state.focus, 'C');
  assert.equal(game.press('Backspace'), 'typed');
  assert.equal(game.state.cells.O, '');
  assert.equal(game.state.focus, 'O');
  // Never forward: from the ones digit the carry after it stays.
  const forward = playing(LEVEL6, [47, 38]);
  keys(forward, 'ArrowUp', '1');
  assert.equal(forward.state.focus, 'O');
  assert.equal(forward.press('Backspace'), 'ignored');
  assert.equal(forward.state.cells.C, '1');
});

test('Backspace on a written column clears its last cell, then the one before; then there is nothing to clear', () => {
  const game = playing(LEVEL6, [47, 38]);
  keys(game, '5', '1');
  assert.equal(game.press('Backspace'), 'typed');
  assert.deepEqual([game.state.cells.C, game.state.focus], ['', 'C']);
  assert.equal(game.press('Backspace'), 'typed');
  assert.deepEqual([game.state.cells.O, game.state.focus], ['', 'O']);
  assert.equal(game.press('Backspace'), 'ignored');
  // A locked column is never cleared: in the tens, Backspace stops at its first cell.
  keys(game, '5', '1', 'Enter', '8');
  assert.equal(game.press('Backspace'), 'typed');
  assert.deepEqual([game.state.cells.T, game.state.focus], ['', 'T']);
  assert.equal(game.press('Backspace'), 'ignored');
  assert.deepEqual(game.state.cells, { H: '', T: '', O: '5', C: '1' });
});

test('Level 7: Backspace clears the ones, then the new tens digit, then takes the borrow back', () => {
  const game = playing(LEVEL7, [52, 27]);
  keys(game, 'ArrowUp', '4', '5');
  assert.equal(game.press('Backspace'), 'typed');
  assert.deepEqual([game.state.cells.O, game.state.focus], ['', 'O']);
  assert.equal(game.press('Backspace'), 'typed');
  assert.deepEqual([game.state.cells.B, game.state.focus], ['', 'B']);
  assert.equal(COLUMN_SUB.borrowed(game.state.cells, game.state.focus), true);
  // In the empty borrow cell, Backspace takes the borrow back.
  assert.equal(game.press('Backspace'), 'typed');
  assert.equal(game.state.focus, 'O');
  assert.equal(COLUMN_SUB.borrowed(game.state.cells, game.state.focus), false);
  assert.equal(game.press('Backspace'), 'ignored');
});

test('Level 7: Backspace in an empty borrow cell with the ones written takes the borrow back and hides the cursor', () => {
  const game = playing(LEVEL7, [52, 27]);
  keys(game, '5', 'ArrowUp');
  assert.equal(game.state.focus, 'B');
  assert.equal(game.press('Backspace'), 'typed');
  assert.equal(game.state.focus, null);
  assert.deepEqual(game.state.cells, { T: '', O: '5', B: '' });
  assert.equal(COLUMN_SUB.borrowed(game.state.cells, game.state.focus), false);
  // Then Backspace clears the ones digit.
  assert.equal(game.press('Backspace'), 'typed');
  assert.deepEqual([game.state.cells.O, game.state.focus], ['', 'O']);
});

test('Level 7: Backspace in the tens clears its digit, and nothing before it', () => {
  const game = playing(LEVEL7, [52, 27]);
  keys(game, 'ArrowUp', '4', '5', 'Enter', '2');
  assert.equal(game.press('Backspace'), 'typed');
  assert.deepEqual([game.state.cells.T, game.state.focus], ['', 'T']);
  assert.equal(game.press('Backspace'), 'ignored');
  assert.deepEqual(game.state.cells, { T: '', O: '5', B: '4' });
});

/* ---------- Moving the cursor ---------- */

test('Level 6: the arrows move between a column\'s digit and its carry, and nowhere else', () => {
  const game = playing(LEVEL6, [47, 38]);
  const at = (key) => [game.press(key), game.state.focus];
  assert.deepEqual(at('ArrowDown'), ['ignored', 'O']);
  assert.deepEqual(at('ArrowRight'), ['ignored', 'O']);
  assert.deepEqual(at('ArrowUp'), ['moved', 'C']);
  assert.deepEqual(at('ArrowUp'), ['ignored', 'C']);
  assert.deepEqual(at('ArrowDown'), ['moved', 'O']);
  assert.deepEqual(at('ArrowLeft'), ['moved', 'C']);
  assert.deepEqual(at('ArrowRight'), ['moved', 'O']);
  assert.deepEqual(game.state.cells, { H: '', T: '', O: '', C: '' });
  // With the column written, the arrows go from its digit.
  keys(game, '5', '1');
  assert.deepEqual(at('ArrowUp'), ['moved', 'C']);
  keys(game, 'Enter');
  assert.deepEqual(at('ArrowLeft'), ['moved', 'H']);
  assert.deepEqual(at('ArrowRight'), ['moved', 'T']);
  assert.deepEqual(at('ArrowUp'), ['ignored', 'T']);
  assert.deepEqual(at('ArrowDown'), ['ignored', 'T']);
});

test('Level 7: Up goes into the borrow cell, Down or Right back to the ones; the tens have nowhere to go', () => {
  const game = playing(LEVEL7, [52, 27]);
  const at = (key) => [game.press(key), game.state.focus];
  assert.deepEqual(at('ArrowLeft'), ['ignored', 'O']);
  assert.deepEqual(at('ArrowUp'), ['moved', 'B']);
  assert.deepEqual(at('ArrowDown'), ['moved', 'O']);
  // Left empty, the borrow cell is no borrow once the cursor leaves it.
  assert.equal(COLUMN_SUB.borrowed(game.state.cells, game.state.focus), false);
  assert.deepEqual(at('ArrowUp'), ['moved', 'B']);
  assert.deepEqual(at('ArrowRight'), ['moved', 'O']);
  keys(game, 'ArrowUp', '4', '5', 'Enter');
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) assert.deepEqual(at(key), ['ignored', 'T']);
});

test('tapping a cell of the column being worked moves the cursor there; any other is ignored', () => {
  const game = playing(LEVEL6, [47, 38]);
  assert.equal(game.tap('C'), 'moved');
  assert.equal(game.state.focus, 'C');
  assert.equal(game.tap('O'), 'moved');
  assert.equal(game.state.focus, 'O');
  for (const id of ['T', 'H', 'B', 'X', '', 'constructor', undefined]) assert.equal(game.tap(id), 'ignored', String(id));
  assert.equal(game.state.focus, 'O');
  keys(game, '5', '1', 'Enter');
  assert.equal(game.tap('C'), 'ignored');
  assert.equal(game.tap('H'), 'moved');
  assert.equal(game.state.focus, 'H');
  assert.deepEqual(game.state.cells, { H: '', T: '', O: '5', C: '1' });
});

test('Level 7: tapping the borrow cell borrows; tapping back to the ones with it empty takes it back', () => {
  const game = playing(LEVEL7, [52, 27]);
  assert.equal(game.tap('B'), 'moved');
  assert.equal(COLUMN_SUB.borrowed(game.state.cells, game.state.focus), true);
  assert.equal(game.tap('O'), 'moved');
  assert.equal(COLUMN_SUB.borrowed(game.state.cells, game.state.focus), false);
  keys(game, 'ArrowUp', '4', '5', 'Enter');
  assert.equal(game.tap('B'), 'ignored');
  assert.equal(game.tap('T'), 'moved');
});

test('the column levels ignore every other key', () => {
  const game = playing(LEVEL6, [47, 38]);
  const before = structuredClone(game.state);
  for (const key of ['a', 'Tab', 'Escape', 'Arrow', 'ArrowUpLeft', 'arrowup', 'Up', '12', '٣', '', ' ', 'Delete', 'enter']) {
    assert.equal(game.press(key), 'ignored', JSON.stringify(key));
  }
  assert.deepEqual(game.state, before);
});

/* ---------- Lives, problems and the run ---------- */

test('a third wrong check is out of lives, and the game then takes no key or tap', () => {
  const game = playing(LEVEL6, [47, 38]);
  assert.equal(keys(game, '5', 'Enter').at(-1), 'wrong');
  assert.equal(keys(game, '0', 'Enter').at(-1), 'wrong');
  assert.equal(game.state.lives, 1);
  assert.equal(keys(game, '2', 'Enter').at(-1), 'out');
  assert.equal(game.state.lives, 0);
  assert.equal(game.state.phase, 'out');
  assert.deepEqual(game.state.bad, ['C']);
  assertLocked(game);
  assert.equal(game.result, null);
});

test('the last column right is the problem right: locked until next(), which starts the next problem afresh', () => {
  const game = playing(LEVEL7, [52, 27], [86, 34]);
  keys(game, '5', 'Enter');                          // wrong: a missing borrow
  assert.deepEqual(work(game).slice(-1), ['correct']);
  assert.equal(game.state.phase, 'correct');
  assert.equal(game.state.solved, 1);
  assert.equal(game.state.focus, null);
  assert.equal(game.state.step, 2);
  assert.deepEqual(game.state.done, [true, true]);
  assert.equal(game.state.lives, 2);
  assertLocked(game);
  const state = game.state;
  game.next();
  assert.equal(game.state, state);                   // still the same object
  assert.equal(state.question, 2);
  assert.equal(state.phase, 'playing');
  assert.deepEqual(state.problem, { a: 86, b: 34, answer: 52 });
  assert.deepEqual(state.x, { need: false, B: 7, O: 2, T: 5 });
  assert.deepEqual(state.cells, { T: '', O: '', B: '' });
  assert.equal(state.step, 0);
  assert.equal(state.focus, 'O');
  assert.deepEqual(state.done, [false, false]);
  assert.deepEqual(state.bad, []);
  assert.equal(state.lives, 3);
});

test('a column problem is timed from when it is shown to its last column right, its wrong checks counted as misses', () => {
  let t = 0;
  const game = createGame({ ...LEVEL6, facts: [fact(LEVEL6, 47, 38), fact(LEVEL6, 23, 41)], pick: () => 0, problemsPerRun: 2 },
    Math.random, () => t);
  t = 1000;
  keys(game, '5', 'Enter');                          // a skipped carry
  t = 1800;
  keys(game, '1', 'Enter', '8', 'Enter');
  t = 2400;
  game.next();
  t = 3000;
  assert.deepEqual(work(game), ['step', 'finished']);
  assert.deepEqual(game.result, {
    level: 6,
    totalMs: 3000,
    misses: 1,
    problems: [{ a: 47, b: 38, ms: 1800, misses: 1 }, { a: 23, b: 41, ms: 600, misses: 0 }],
  });
  assert.equal(game.state.phase, 'finished');
  assertLocked(game);
});

test('the 20th problem right finishes the run; a run out of lives has no result', () => {
  const game = createGame(LEVEL7);
  for (let q = 1; q < 20; q++) {
    assert.equal(work(game).at(-1), 'correct', `question ${q}`);
    game.next();
  }
  assert.equal(game.state.solved, 19);
  assert.equal(game.result, null);
  assert.equal(work(game).at(-1), 'finished');
  assert.equal(game.state.solved, 20);
  assert.equal(game.result.problems.length, 20);
  game.next();
  assert.equal(game.state.question, 20);

  game.restart();
  assert.equal(game.state.question, 1);
  assert.deepEqual([missOnes(game), missOnes(game), missOnes(game)], ['wrong', 'wrong', 'out']);
  assert.equal(game.state.phase, 'out');
  assert.equal(game.result, null);
});

test('start() moves between column and fact levels, the one state object holding only the level\'s own play', () => {
  const game = playing(LEVEL6, [47, 38]);
  const state = game.state;
  keys(game, '5', 'Enter');
  game.start(LEVEL1);
  assert.equal(game.state, state);
  for (const key of ['x', 'cells', 'step', 'focus', 'done', 'bad']) assert.ok(!(key in state), key);
  assert.deepEqual(Object.keys(state).sort(), ['lives', 'phase', 'problem', 'question', 'solved', 'typed']);
  assert.equal(game.tap('O'), 'ignored');
  assert.equal(game.press('ArrowUp'), 'ignored');
  game.start(LEVEL7);
  assert.equal(game.state, state);
  assert.equal(state.step, 0);
  assert.equal(state.focus, 'O');
  assert.equal(state.lives, 3);
  assert.deepEqual(state.cells, { T: '', O: '', B: '' });
  assert.deepEqual(state.x, COLUMN_SUB.solve(state.problem.a, state.problem.b));
});

test('leave() locks a column level until start()', () => {
  const game = playing(LEVEL6, [47, 38]);
  keys(game, '5');
  game.leave();
  assert.equal(game.state.phase, 'left');
  assertLocked(game);
  game.start();
  assert.equal(game.state.phase, 'playing');
  assert.deepEqual(game.state.cells, { H: '', T: '', O: '', C: '' });
});
