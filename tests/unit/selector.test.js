import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowLabel, byTopic } from '../../src/selector.js';
import { LEVEL1 } from '../../src/level1.js';
import { LEVEL2 } from '../../src/level2.js';
import { LEVELS } from '../../src/levels.js';

// The rows as shown (Levels 6–7 batch plan): by topic, the topics in the
// order each first comes in route order, and in route order within one.

test('the selector shows the levels by topic: Addition 1, 6; Subtraction 2, 3, 7; Multiplication 4; Division 5', () => {
  const shown = byTopic(LEVELS);
  assert.deepEqual(shown.map(l => l.n), [1, 6, 2, 3, 7, 4, 5]);
  assert.deepEqual([...new Set(shown.map(l => l.topic))], ['Addition', 'Subtraction', 'Multiplication', 'Division']);
  assert.deepEqual(LEVELS.map(l => l.n), [1, 2, 3, 4, 5, 6, 7]);   // left as it was
});

test('a topic that first comes late is placed where it first comes, its levels in the order given', () => {
  const level = (n, topic) => ({ n, topic });
  const shown = byTopic([level(1, 'A'), level(2, 'B'), level(3, 'A'), level(4, 'C'), level(5, 'B'), level(6, 'A')]);
  assert.deepEqual(shown.map(l => l.n), [1, 3, 6, 2, 5, 4]);
  assert.deepEqual(byTopic([]), []);
});

// A level row's accessible name (finished-mark spec §4).

test('an unfinished level is named by its number and name alone', () => {
  assert.equal(rowLabel(LEVEL1, null), 'Level 1: Single-digit addition');
  assert.equal(rowLabel(LEVEL2, null), 'Level 2: Subtraction within 10');
});

test('a finished level\'s name adds its best time, written as the finish screen writes it', () => {
  assert.equal(rowLabel(LEVEL1, 72_400), 'Level 1: Single-digit addition. Finished, best 1:12.4.');
  assert.equal(rowLabel(LEVEL2, 729_100), 'Level 2: Subtraction within 10. Finished, best 12:09.1.');
});

test('a best of 0 ms is still a finished level', () => {
  assert.equal(rowLabel(LEVEL1, 0), 'Level 1: Single-digit addition. Finished, best 0:00.0.');
});
