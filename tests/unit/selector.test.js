import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowLabel } from '../../src/selector.js';
import { LEVEL1 } from '../../src/level1.js';
import { LEVEL2 } from '../../src/level2.js';

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
