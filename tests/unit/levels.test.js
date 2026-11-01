import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL1 } from '../../src/level1.js';
import { LEVEL2 } from '../../src/level2.js';
import { LEVELS } from '../../src/levels.js';

// Level 2's problem for each of 55 equal slices of the rng's range.
const everySlice = () => Array.from({ length: 55 }, (_, k) => LEVEL2.makeProblem(() => (k + 0.5) / 55));

test('Level 2 asks a − b with a and b whole numbers from 0 to 9 and b at most a', () => {
  for (const { a, b, answer } of everySlice()) {
    assert.ok(Number.isInteger(a) && Number.isInteger(b), `${a} − ${b}`);
    assert.ok(0 <= b && b <= a && a <= 9, `${a} − ${b}`);
    assert.equal(answer, a - b);
  }
});

test('each of Level 2\'s 55 facts is equally likely', () => {
  const facts = everySlice().map(p => `${p.a}-${p.b}`);
  assert.equal(new Set(facts).size, 55);
  // "x − x" is 10 facts in 55. Picking a, then b, would make it about 29%.
  assert.equal(everySlice().filter(p => p.a === p.b).length, 10);
});

test('Level 2 runs from 0 − 0 to 9 − 9 across the rng\'s range', () => {
  assert.deepEqual(LEVEL2.makeProblem(() => 0), { a: 0, b: 0, answer: 0 });
  assert.deepEqual(LEVEL2.makeProblem(() => 0.9999), { a: 9, b: 9, answer: 0 });
});

test('Level 2 answers are one digit, 0 to 9, with 3 lives a problem', () => {
  assert.deepEqual(LEVEL2.possibleAnswers, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.equal(LEVEL2.maxAnswerLength, 1);
  assert.equal(LEVEL2.livesPerProblem, 3);
});

test('the operators are "+" and the minus sign U+2212, heard as "plus" and "minus"', () => {
  assert.equal(LEVEL1.op, '+');
  assert.equal(LEVEL1.word, 'plus');
  assert.equal(LEVEL2.op, '−');
  assert.equal(LEVEL2.word, 'minus');
});

test('the built levels are Level 1 then Level 2, each with its topic, name and sample', () => {
  assert.deepEqual(LEVELS, [LEVEL1, LEVEL2]);
  assert.deepEqual(LEVELS.map(l => [l.n, l.topic, l.name, l.sample]), [
    [1, 'Addition', 'Single-digit addition', [3, 4]],
    [2, 'Subtraction', 'Subtraction within 10', [7, 3]],
  ]);
});
