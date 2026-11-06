import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL1 } from '../../src/level1.js';
import { LEVEL2 } from '../../src/level2.js';
import { LEVEL3 } from '../../src/level3.js';
import { LEVEL4 } from '../../src/level4.js';
import { LEVEL5 } from '../../src/level5.js';
import { LEVEL6 } from '../../src/level6.js';
import { LEVEL7 } from '../../src/level7.js';
import { COLUMN_ADD, COLUMN_SUB } from '../../src/columns.js';
import { LEVELS, levelName } from '../../src/levels.js';

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

test('the operators are the times sign U+00D7 and the division sign U+00F7, heard as "times" and "divided by"', () => {
  assert.equal(LEVEL4.op, '×');
  assert.equal(LEVEL4.word, 'times');
  assert.equal(LEVEL5.op, '÷');
  assert.equal(LEVEL5.word, 'divided by');
});

test('the built levels are Levels 1 to 7 in route order, each with its topic, name and sample', () => {
  assert.deepEqual(LEVELS, [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7]);
  assert.deepEqual(LEVELS.map(l => [l.n, l.topic, l.name, l.sample]), [
    [1, 'Addition', 'Single-digit addition', [3, 4]],
    [2, 'Subtraction', 'Subtraction within 10', [7, 3]],
    [3, 'Subtraction', 'Subtraction past 10', [13, 5]],
    [4, 'Multiplication', 'Times tables', [6, 7]],
    [5, 'Division', 'Division facts', [56, 8]],
    [6, 'Addition', 'Column addition', [47, 38]],
    [7, 'Subtraction', 'Column subtraction', [52, 27]],
  ]);
});

// The number a level is shown with, k: its place within its topic, in
// route order. Set in each level's own file, so it never changes when
// another level is added. n, the build order, is what runs are kept by.
test('each level is numbered within its topic: Addition 1, 2; Subtraction 1, 2, 3; Multiplication 1; Division 1', () => {
  assert.deepEqual(LEVELS.map(l => [l.n, l.topic, l.k, l.name]), [
    [1, 'Addition', 1, 'Single-digit addition'],
    [2, 'Subtraction', 1, 'Subtraction within 10'],
    [3, 'Subtraction', 2, 'Subtraction past 10'],
    [4, 'Multiplication', 1, 'Times tables'],
    [5, 'Division', 1, 'Division facts'],
    [6, 'Addition', 2, 'Column addition'],
    [7, 'Subtraction', 3, 'Column subtraction'],
  ]);
  for (const level of LEVELS) assert.ok(Object.hasOwn(level, 'k'), `Level ${level.n} sets its own k`);
});

test('each topic\'s numbers run 1, 2, 3, … in route order', () => {
  for (const topic of new Set(LEVELS.map(l => l.topic))) {
    const ks = LEVELS.filter(l => l.topic === topic).map(l => l.k);
    assert.deepEqual(ks, ks.map((_, i) => i + 1), topic);
  }
});

test('a level is named by its topic and its number in it: "Subtraction 3"', () => {
  assert.deepEqual(LEVELS.map(levelName), [
    'Addition 1', 'Subtraction 1', 'Subtraction 2', 'Multiplication 1', 'Division 1', 'Addition 2', 'Subtraction 3',
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

// A column level has no answer box: its answer is written a digit a cell.
test('every fact level\'s answer is one the answer box was sized for', () => {
  for (const level of LEVELS.filter(l => l.kind !== 'column')) {
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

test('Level 4\'s facts are a × b for every a and b from 0 to 9, each once: 100, by a, then b', () => {
  const { facts } = LEVEL4;
  assert.equal(facts.length, 100);
  for (const { a, b, answer } of facts) {
    assert.ok(Number.isInteger(a) && Number.isInteger(b), `${a} × ${b}`);
    assert.ok(0 <= a && a <= 9 && 0 <= b && b <= 9, `${a} × ${b}`);
    assert.equal(answer, a * b);
  }
  assert.equal(new Set(facts.map(f => `${f.a} ${f.b}`)).size, 100);
  // The whole order: the run tests pick facts by their place in it.
  const inOrder = [];
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) inOrder.push({ a, b, answer: a * b });
  assert.deepEqual(facts, inOrder);
  assert.deepEqual(facts.at(-1), { a: 9, b: 9, answer: 81 });
});

test('Level 4 answers are every product, 0 to 81, in a two-digit box, with 3 lives a problem and runs of 20', () => {
  const products = [...new Set(LEVEL4.facts.map(f => f.answer))].sort((x, y) => x - y).map(String);
  assert.deepEqual(LEVEL4.possibleAnswers, products);
  assert.equal(LEVEL4.possibleAnswers.length, 37);
  assert.deepEqual(LEVEL4.possibleAnswers.slice(0, 12), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12']);
  assert.equal(LEVEL4.possibleAnswers.at(-1), '81');
  for (const s of LEVEL4.possibleAnswers) assert.ok(s.length <= LEVEL4.maxAnswerLength, s);
  assert.equal(LEVEL4.maxAnswerLength, 2);
  assert.equal(LEVEL4.livesPerProblem, 3);
  assert.equal(LEVEL4.problemsPerRun, 20);
});

test('Level 5\'s facts are (q × b) ÷ b for b from 1 to 9 and q from 0 to 9, each once: 90, by b, then q', () => {
  const { facts } = LEVEL5;
  assert.equal(facts.length, 90);
  for (const { a, b, answer } of facts) {
    assert.ok(Number.isInteger(a) && Number.isInteger(b), `${a} ÷ ${b}`);
    assert.ok(1 <= b && b <= 9 && 0 <= a && a <= 81, `${a} ÷ ${b}`);
    // A whole number: the division comes out exactly.
    assert.ok(Number.isInteger(a / b), `${a} ÷ ${b}`);
    assert.equal(answer, a / b);
    assert.ok(0 <= answer && answer <= 9, `${a} ÷ ${b}`);
  }
  assert.equal(new Set(facts.map(f => `${f.a} ${f.b}`)).size, 90);
  const inOrder = [];
  for (let b = 1; b <= 9; b++) for (let q = 0; q <= 9; q++) inOrder.push({ a: q * b, b, answer: q });
  assert.deepEqual(facts, inOrder);
  assert.deepEqual(facts.slice(0, 3), [{ a: 0, b: 1, answer: 0 }, { a: 1, b: 1, answer: 1 }, { a: 2, b: 1, answer: 2 }]);
  assert.deepEqual(facts.at(-1), { a: 81, b: 9, answer: 9 });
});

test('Level 5\'s facts are Level 4\'s multiplications undone, with no division by 0', () => {
  // Level 4's a × b = p with b of 1 or more is Level 5's p ÷ b = a.
  const undone = LEVEL4.facts.filter(f => f.b >= 1).map(f => `${f.answer} ÷ ${f.b} = ${f.a}`);
  assert.deepEqual(new Set(LEVEL5.facts.map(f => `${f.a} ÷ ${f.b} = ${f.answer}`)), new Set(undone));
});

test('Level 5 answers are one digit, 0 to 9, with 3 lives a problem and runs of 20', () => {
  assert.deepEqual(LEVEL5.possibleAnswers, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.equal(LEVEL5.maxAnswerLength, 1);
  assert.equal(LEVEL5.livesPerProblem, 3);
  assert.equal(LEVEL5.problemsPerRun, 20);
});

test('Levels 6 and 7 are column addition and column subtraction, played on the column board by their methods', () => {
  assert.deepEqual([LEVEL6, LEVEL7].map(l => [l.n, l.topic, l.name, l.op, l.word, l.sample, l.livesPerProblem, l.problemsPerRun, l.kind]), [
    [6, 'Addition', 'Column addition', '+', 'plus', [47, 38], 3, 20, 'column'],
    [7, 'Subtraction', 'Column subtraction', '−', 'minus', [52, 27], 3, 20, 'column'],
  ]);
  assert.equal(LEVEL6.method, COLUMN_ADD);
  assert.equal(LEVEL7.method, COLUMN_SUB);
  // Listed: the column board plays them.
  assert.ok(LEVELS.includes(LEVEL6) && LEVELS.includes(LEVEL7));
  // The fact levels are the only ones without a kind.
  assert.deepEqual(LEVELS.filter(l => l.kind !== 'column').map(l => l.n), [1, 2, 3, 4, 5]);
});

test('Level 6\'s facts are a + b for every a and b from 10 to 99, each once: 8100, by a, then b', () => {
  const { facts } = LEVEL6;
  assert.equal(facts.length, 8100);
  const inOrder = [];
  for (let a = 10; a <= 99; a++) for (let b = 10; b <= 99; b++) inOrder.push({ a, b, answer: a + b });
  assert.deepEqual(facts, inOrder);
  assert.deepEqual([facts[0], facts.at(-1)], [{ a: 10, b: 10, answer: 20 }, { a: 99, b: 99, answer: 198 }]);
  // 45 in every 100 carry in the ones.
  assert.equal(facts.filter(f => f.a % 10 + f.b % 10 >= 10).length, 3645);
});

test('Level 7\'s facts are a − b for every a and b from 10 to 99 with b at most a, each once: 4095, by a, then b', () => {
  const { facts } = LEVEL7;
  assert.equal(facts.length, 4095);
  const inOrder = [];
  for (let a = 10; a <= 99; a++) for (let b = 10; b <= a; b++) inOrder.push({ a, b, answer: a - b });
  assert.deepEqual(facts, inOrder);
  for (const { a, b, answer } of facts) assert.ok(0 <= answer && answer <= 89, `${a} − ${b}`);
  assert.deepEqual([facts[0], facts.at(-1)], [{ a: 10, b: 10, answer: 0 }, { a: 99, b: 99, answer: 0 }]);
  assert.equal(facts.filter(f => f.a % 10 < f.b % 10).length, 1620);
});
