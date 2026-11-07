import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowLabel, byTopic, gridFor, tileFor } from '../../src/selector.js';
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

// The topic columns (the topic-columns mockup, 2026-11-07):
// gridFor(heights, gap, room, most, cap) gives the columns a band, the
// grid's height and whether it scrolls; null where fewer than two tiles fit
// across (the one stacked column). `room` is what the rows may take: the
// list's height less its padding at its least (16px above, 6px below).

// The selector's four topics as laid out: Addition (2 rows), Subtraction
// (3), Multiplication (1), Division (1), each heading and its rows.
const GROUPS = [194.5, 286.5, 102.5, 102.5];
// Six, as the mockup's ?topics=6 has them: two more of two rows and one.
const SIX = [...GROUPS, 194.5, 102.5];

test('fewer than two tiles across, or one topic, is the one stacked column', () => {
  assert.equal(gridFor(GROUPS, 32, 742, 1), null);                // 375×812
  assert.equal(gridFor(GROUPS, 32, 742, 0), null);
  assert.equal(gridFor([194.5], 32, 742, 4), null, 'one topic');
});

test('four topics are one band of four where four fit across, at any height that holds it', () => {
  for (const room of [583, 656, 536, 826, 1006]) assert.deepEqual(gridFor(GROUPS, 32, room, 4), { cols: 4, h: 286.5, scrolls: false }, `room ${room}`);
  assert.deepEqual(gridFor(GROUPS, 32, 600, 9), { cols: 4, h: 286.5, scrolls: false }, 'no more than four, however wide');
});

test('the bands are as even as they come: 6 topics in four columns are 3 + 3, 4 in three are 2 + 2', () => {
  assert.deepEqual(gridFor(SIX, 32, 900, 4), { cols: 3, h: 286.5 + 32 + 194.5, scrolls: false });
  assert.deepEqual(gridFor(SIX, 32, 900, 6), { cols: 3, h: 513, scrolls: false }, 'not six narrow tiles, even where six fit');
  assert.deepEqual(gridFor(GROUPS, 32, 900, 3), { cols: 2, h: 286.5 + 32 + 102.5, scrolls: false });
  assert.deepEqual(gridFor(GROUPS, 32, 900, 4, 3), { cols: 2, h: 421, scrolls: false }, 'a cap of three');
});

test('where a band won\'t fit, more columns a band, as long as it gets shorter and fits', () => {
  assert.deepEqual(gridFor(SIX, 32, 300, 6), { cols: 6, h: 286.5, scrolls: false });
  assert.deepEqual(gridFor(SIX, 32, 286.5, 6), { cols: 6, h: 286.5, scrolls: false }, 'a grid exactly as tall as the room fits');
});

test('where none fits, the shortest, the first of equals, and it scrolls', () => {
  assert.deepEqual(gridFor(GROUPS, 32, 320, 2), { cols: 2, h: 421, scrolls: true });   // 844×390
  assert.deepEqual(gridFor(SIX, 32, 200, 6), { cols: 6, h: 286.5, scrolls: true });
  // Five columns are as short as four (two bands of three either way): four's.
  assert.deepEqual(gridFor(SIX, 32, 400, 5), { cols: 3, h: 513, scrolls: true });
});

// tileFor(width, n, gap, max, dpr): a tile's share of the width, down to
// whole device pixels, at most `max`.
test('a tile is its share of the width, down to a whole device pixel, at most 320px', () => {
  assert.equal(tileFor(1320, 4, 24, 320, 1), 312);                 // 1366×657: its sides 23px
  assert.equal(tileFor(1319, 4, 24, 320, 1), 311);
  assert.equal(tileFor(1394, 4, 24, 320, 1), 320, '1440×900: capped');
  assert.equal(tileFor(1233, 4, 24, 320, 1.5), 290);               // 435.375 device px → 435
  assert.equal(tileFor(1232, 4, 24, 320, 1.25), 289.6);            // 362.5 device px → 362
  assert.equal(tileFor(624, 2, 24, 320, 3), 300);
});
