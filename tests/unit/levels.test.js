import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL1 } from '../../src/level1.js';
import { LEVEL2 } from '../../src/level2.js';
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
});

test('the built levels are Level 1 then Level 2, each with its topic, name and sample', () => {
  assert.deepEqual(LEVELS, [LEVEL1, LEVEL2]);
  assert.deepEqual(LEVELS.map(l => [l.n, l.topic, l.name, l.sample]), [
    [1, 'Addition', 'Single-digit addition', [3, 4]],
    [2, 'Subtraction', 'Subtraction within 10', [7, 3]],
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
