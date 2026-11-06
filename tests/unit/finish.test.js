import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, finishText } from '../../src/finish.js';
import { LEVEL1 } from '../../src/level1.js';
import { LEVEL2 } from '../../src/level2.js';
import { LEVEL4 } from '../../src/level4.js';
import { LEVEL7 } from '../../src/level7.js';

test('times read m:ss.s, tenths cut as a stopwatch does', () => {
  const cases = [
    [0, '0:00.0'], [99, '0:00.0'], [100, '0:00.1'], [5050, '0:05.0'], [59999, '0:59.9'],
    [60000, '1:00.0'], [72400, '1:12.4'], [72499, '1:12.4'], [600000, '10:00.0'], [3723400, '62:03.4'],
  ];
  for (const [ms, text] of cases) assert.equal(formatTime(ms), text, `${ms}ms`);
});

test('the first run of a level is a new best: it has nothing to beat', () => {
  assert.deepEqual(finishText(LEVEL1, 72400, 2, null), {
    title: 'Addition 1 complete',
    time: '1:12.4',
    best: 'New best',
    isNew: true,
    misses: '2 misses',
    said: 'Addition 1 complete. 1:12.4, new best.',
  });
});

test('a run faster than the best is a new best', () => {
  const text = finishText(LEVEL2, 68000, 0, 68001);
  assert.equal(text.best, 'New best');
  assert.equal(text.isNew, true);
  assert.equal(text.said, 'Subtraction 1 complete. 1:08.0, new best.');
});

test('a slower run shows the best; a tie is not a new best', () => {
  for (const totalMs of [75000, 68900]) {
    const text = finishText(LEVEL2, totalMs, 1, 68900);
    assert.equal(text.best, 'Best 1:08.9');
    assert.equal(text.isNew, false);
    assert.equal(text.said, `Subtraction 1 complete. ${formatTime(totalMs)}, best 1:08.9.`);
  }
});

test('misses read "No misses", "1 miss", "N misses"', () => {
  assert.deepEqual([0, 1, 2, 7].map(n => finishText(LEVEL1, 1000, n, null).misses), ['No misses', '1 miss', '2 misses', '7 misses']);
});

// The level by its topic and its number within it, not its build order:
// Level 7 is Subtraction's third.
test('the title names the level by its topic and its number in it: "Subtraction 3 complete"', () => {
  assert.equal(finishText(LEVEL7, 72400, 0, null).title, 'Subtraction 3 complete');
  assert.equal(finishText(LEVEL7, 72400, 0, null).said, 'Subtraction 3 complete. 1:12.4, new best.');
  assert.equal(finishText(LEVEL4, 72400, 0, 1).title, 'Multiplication 1 complete');
  assert.equal(finishText(LEVEL4, 72400, 0, 1).said, 'Multiplication 1 complete. 1:12.4, best 0:00.0.');
});
