import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL1 } from '../../src/level1.js';
import { LEVEL2 } from '../../src/level2.js';
import { LEVEL3 } from '../../src/level3.js';
import { LEVELS } from '../../src/levels.js';

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
  assert.equal(LEVEL3.op, '−');
  assert.equal(LEVEL3.word, 'minus');
});

test('the built levels are Levels 1, 2 and 3, each with its topic, name and sample', () => {
  assert.deepEqual(LEVELS, [LEVEL1, LEVEL2, LEVEL3]);
  assert.deepEqual(LEVELS.map(l => [l.n, l.topic, l.name, l.sample]), [
    [1, 'Addition', 'Single-digit addition', [3, 4]],
    [2, 'Subtraction', 'Subtraction within 10', [7, 3]],
    [3, 'Subtraction', 'Subtraction past 10', [13, 5]],
  ]);
});

test('Level 1\'s facts are a + b for every a and b from 0 to 9, each once, in the order a × 10 + b', () => {
  assert.equal(LEVEL1.facts.length, 100);
  LEVEL1.facts.forEach((fact, i) => {
    const a = Math.floor(i / 10), b = i % 10;
    assert.deepEqual(fact, { a, b, answer: a + b });
  });
});

test('Level 2\'s facts are a − b with b at most a, each once: 55, in the order 0 − 0, 1 − 0, 1 − 1, 2 − 0, …', () => {
  const { facts } = LEVEL2;
  assert.equal(facts.length, 55);
  for (const { a, b, answer } of facts) {
    assert.ok(Number.isInteger(a) && Number.isInteger(b), `${a} − ${b}`);
    assert.ok(0 <= b && b <= a && a <= 9, `${a} − ${b}`);
    assert.equal(answer, a - b);
  }
  assert.equal(new Set(facts.map(f => `${f.a} ${f.b}`)).size, 55);
  // The whole order: the run tests pick facts by their place in it.
  const inOrder = [];
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= a; b++) inOrder.push({ a, b, answer: a - b });
  assert.deepEqual(facts, inOrder);
  // "x − x" is 10 facts in 55.
  assert.equal(facts.filter(f => f.a === f.b).length, 10);
});

test('a run is 20 problems on every level, and no level has fewer facts than that', () => {
  for (const level of LEVELS) {
    assert.equal(level.problemsPerRun, 20, `Level ${level.n}`);
    assert.ok(level.facts.length >= level.problemsPerRun, `Level ${level.n}`);
  }
});

test('every fact\'s answer is one the answer box was sized for', () => {
  for (const level of LEVELS) {
    for (const { a, b, answer } of level.facts) {
      assert.ok(level.possibleAnswers.includes(String(answer)), `Level ${level.n}: ${a}, ${b}`);
    }
  }
});

test('Level 3\'s facts are a − b with a from 10 to 18, b from 1 to 9 and an answer of 1 to 9: 45, each once', () => {
  const { facts } = LEVEL3;
  assert.equal(facts.length, 45);
  for (const { a, b, answer } of facts) {
    assert.ok(Number.isInteger(a) && Number.isInteger(b), `${a} − ${b}`);
    assert.ok(10 <= a && a <= 18 && 1 <= b && b <= 9, `${a} − ${b}`);
    assert.equal(answer, a - b);
    assert.ok(1 <= answer && answer <= 9, `${a} − ${b}`);
  }
  assert.equal(new Set(facts.map(f => `${f.a} ${f.b}`)).size, 45);
});

test('Level 3\'s facts are exactly the subtractions whose addition, in Level 1, crosses 10', () => {
  // Level 1's x + y = s with s of 10 or more is Level 3's s − x = y.
  const crossing = LEVEL1.facts.filter(f => f.answer >= 10).map(f => `${f.answer} − ${f.a} = ${f.b}`);
  assert.equal(crossing.length, 45);
  assert.deepEqual(new Set(LEVEL3.facts.map(f => `${f.a} − ${f.b} = ${f.answer}`)), new Set(crossing));
});

test('Level 3\'s facts run by the first number, then the second: 10 − 1, 10 − 2, …, 10 − 9, 11 − 2, …, 18 − 9', () => {
  // The whole order: the run tests pick facts by their place in it.
  const inOrder = [];
  for (let a = 10; a <= 18; a++) for (let b = a - 9; b <= 9; b++) inOrder.push({ a, b, answer: a - b });
  assert.deepEqual(LEVEL3.facts, inOrder);
  assert.deepEqual(LEVEL3.facts.slice(0, 10).map(f => `${f.a} − ${f.b}`), [
    '10 − 1', '10 − 2', '10 − 3', '10 − 4', '10 − 5', '10 − 6', '10 − 7', '10 − 8', '10 − 9', '11 − 2',
  ]);
  assert.deepEqual(LEVEL3.facts.at(-1), { a: 18, b: 9, answer: 9 });
});

test('Level 3 answers are one digit, 1 to 9, with 3 lives a problem and runs of 20', () => {
  assert.deepEqual(LEVEL3.possibleAnswers, ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.equal(LEVEL3.maxAnswerLength, 1);
  assert.equal(LEVEL3.livesPerProblem, 3);
  assert.equal(LEVEL3.problemsPerRun, 20);
});
