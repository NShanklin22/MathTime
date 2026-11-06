import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowLabel, byTopic, columnsFor } from '../../src/selector.js';
import { LEVEL1 } from '../../src/level1.js';
import { LEVEL2 } from '../../src/level2.js';
import { LEVEL4 } from '../../src/level4.js';
import { LEVEL6 } from '../../src/level6.js';
import { LEVEL7 } from '../../src/level7.js';
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

test('an unfinished level is named by its topic, its number in it and its name alone', () => {
  assert.equal(rowLabel(LEVEL1, null), 'Addition, Level 1: Single-digit addition');
  assert.equal(rowLabel(LEVEL2, null), 'Subtraction, Level 1: Subtraction within 10');
  assert.equal(rowLabel(LEVEL4, null), 'Multiplication, Level 1: Times tables');
  assert.equal(rowLabel(LEVEL6, null), 'Addition, Level 2: Column addition');
  assert.equal(rowLabel(LEVEL7, null), 'Subtraction, Level 3: Column subtraction');
});

test('a finished level\'s name adds its best time, written as the finish screen writes it', () => {
  assert.equal(rowLabel(LEVEL1, 72_400), 'Addition, Level 1: Single-digit addition. Finished, best 1:12.4.');
  assert.equal(rowLabel(LEVEL2, 729_100), 'Subtraction, Level 1: Subtraction within 10. Finished, best 12:09.1.');
  assert.equal(rowLabel(LEVEL7, 72_400), 'Subtraction, Level 3: Column subtraction. Finished, best 1:12.4.');
});

test('a best of 0 ms is still a finished level', () => {
  assert.equal(rowLabel(LEVEL1, 0), 'Addition, Level 1: Single-digit addition. Finished, best 0:00.0.');
});

// The topic groups in columns (incident 2026-11-05, corrective action A):
// columnsFor(heights, gap, room, most) gives the group each column starts
// with. The groups go in order, never split, `gap` apart within a column.
// `room` is what the rows may take: the list's height less its padding at
// its least (16px above, 6px below).

// The selector's four groups as laid out: Addition (2 rows), Subtraction
// (3), Multiplication (1), Division (1), each heading and its rows. One
// column of them is 782px.
const GROUPS = [194.5, 286.5, 102.5, 102.5];

test('where one column fits, it stays one column, however wide the window', () => {
  assert.deepEqual(columnsFor(GROUPS, 32, 782, 4), [0]);
  assert.deepEqual(columnsFor(GROUPS, 32, 826, 4), [0]);           // 1440×900 (848 − 22)
  assert.deepEqual(columnsFor(GROUPS, 32, 876, 4), [0]);           // 1920×950
});

test('the fewest columns that fit, the groups split in order so the tallest column is as short as it can be', () => {
  // 1366×657, 1536×730 and 1280×610: two columns, Addition and Subtraction (513px), then Multiplication and Division (237px).
  for (const room of [583, 656, 536]) assert.deepEqual(columnsFor(GROUPS, 32, room, 3), [0, 2], `room ${room}`);
  // 1366×400: 513px is too tall, so three: Addition, Subtraction, then Multiplication and Division (286.5px).
  assert.deepEqual(columnsFor(GROUPS, 32, 330, 3), [0, 1, 2]);
  assert.deepEqual(columnsFor(GROUPS, 32, 513, 3), [0, 2], 'a column exactly as tall as the room fits');
  assert.deepEqual(columnsFor(GROUPS, 32, 512.99, 3), [0, 1, 2]);
});

test('where no number of columns the width takes fits, the fewest that are as short as any, and the list scrolls', () => {
  assert.deepEqual(columnsFor(GROUPS, 32, 742, 1), [0]);           // 375×812
  assert.deepEqual(columnsFor(GROUPS, 32, 320, 2), [0, 2]);        // 844×390
  // 1920×330: three columns are as short as four (Subtraction alone is 286.5px), so three.
  assert.deepEqual(columnsFor(GROUPS, 32, 260, 4), [0, 1, 2]);
  assert.deepEqual(columnsFor(GROUPS, 32, 100, 9), [0, 1, 2], 'no more columns than make it shorter');
  // Four groups as tall as each other: each column shorter than the last, up to one a group, and never more.
  assert.deepEqual(columnsFor([100, 100, 100, 100], 32, 50, 9), [0, 1, 2, 3], 'never more columns than groups');
});

test('a width with no room for even one column still has one', () => {
  assert.deepEqual(columnsFor(GROUPS, 32, 300, 0), [0]);
});

test('the split is contiguous and minimises the tallest column, gaps counted only between groups in a column', () => {
  // [100, 100] then [100, 10, 10]: 232 tall; [100] then [100, 100, 10, 10] would be 284.
  assert.deepEqual(columnsFor([100, 100, 100, 10, 10], 32, 250, 2), [0, 2]);
  // The gaps decide it. With none, [90] then [30, 30, 30] (90) beats
  // [90, 30] then [30, 30] (120); 32px apart, it is 154 against 152.
  assert.deepEqual(columnsFor([90, 30, 30, 30], 0, 100, 2), [0, 1]);
  assert.deepEqual(columnsFor([90, 30, 30, 30], 32, 200, 2), [0, 2]);
  // Two splits as tall as each other: the earlier columns take more, as a column of text fills.
  assert.deepEqual(columnsFor([100, 100, 100], 32, 240, 2), [0, 2]);
});

test('where splits are as tall, every column takes as much as it can, leaving one group for each column after it', () => {
  // The tallest can be no shorter than 10. [10], [5], [5, 1] and [10],
  // [5, 5], [1] both reach it; the second column takes more.
  assert.deepEqual(columnsFor([10, 5, 5, 1], 0, 10, 3), [0, 1, 3]);
  // It may not take what the later columns need: three groups, three columns.
  assert.deepEqual(columnsFor([1, 1, 1], 0, 1, 3), [0, 1, 2]);
});

test('many groups are split as fast as a few', () => {
  const many = Array.from({ length: 40 }, (_, i) => 50 + (i * 37) % 90);
  const started = performance.now();
  const starts = columnsFor(many, 32, 400, 12);
  assert.ok(performance.now() - started < 200, 'well under a frame or two');
  assert.equal(starts[0], 0);
  assert.ok(starts.every((s, i) => i === 0 || s > starts[i - 1]), 'in order');
});

test('no groups, no columns', () => {
  assert.deepEqual(columnsFor([], 32, 500, 3), []);
});
