import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextLesson, topicProgress, heroParts, boardButton, cutBoard, OTHER_TAB } from '../../src/home.js';
import { LEVELS } from '../../src/levels.js';
import { IN_PROGRESS } from '../../src/daily.js';

const done = (...ns) => n => ns.includes(n);

test('Next lesson is the first level not finished, in build order', () => {
  assert.equal(nextLesson(LEVELS, done()).level.n, 1);
  assert.equal(nextLesson(LEVELS, done(1, 2)).level.n, 3);
  assert.equal(nextLesson(LEVELS, done(1, 2, 3, 4)).level.n, 5);
  // A gap is filled first: Level 2 before Level 6.
  assert.equal(nextLesson(LEVELS, done(1, 3, 4, 5)).level.n, 2);
  assert.equal(nextLesson(LEVELS, done(1)).title, 'Next lesson');
});

test('with every level finished, Next lesson is the one played last, "Last played"', () => {
  const all = () => true;
  assert.deepEqual(nextLesson(LEVELS, all, 3), { level: LEVELS[2], title: 'Last played' });
  // None known (or one that isn't built): the last level.
  assert.equal(nextLesson(LEVELS, all, null).level.n, 7);
  assert.equal(nextLesson(LEVELS, all, 99).level.n, 7);
});

test('progress is a row per topic, in the order each first comes, with its levels finished and built', () => {
  assert.deepEqual(topicProgress(LEVELS, done(1, 2, 3, 4)), [
    { topic: 'Addition', done: 1, of: 2 },
    { topic: 'Subtraction', done: 2, of: 3 },
    { topic: 'Multiplication', done: 1, of: 1 },
    { topic: 'Division', done: 0, of: 1 },
  ]);
  const rows = topicProgress(LEVELS, () => true);
  assert.equal(rows.reduce((n, r) => n + r.of, 0), LEVELS.length);
  assert.ok(rows.every(r => r.done === r.of));
  assert.ok(topicProgress(LEVELS, () => false).every(r => r.done === 0));
});

test('the daily challenge on Home: Start before the try, the done line after it', () => {
  const date = '2026-11-17';
  assert.equal(heroParts(date, null, null).state, 'start');
  assert.equal(heroParts(date, null, null).day, 'Tue 17 Nov');
  assert.equal(heroParts(date, null, null).label, 'Daily challenge, Tue 17 Nov: 20 problems, one try. Start');
  const t = { started: true, ended: true, out: false, totalMs: 72_600, reached: 20 };
  assert.deepEqual(heroParts(date, t, { place: 5, of: 9 }), {
    state: 'done', day: 'Tue 17 Nov', res: '1:12.6 · 5th of 9', short: '1:12.6 · 5th of 9', label: 'Daily challenge, Tue 17 Nov: done, 1:12.6, 5th of 9. Show the board',
  });
  // Offline (no place): the time alone. Out: where it went out.
  assert.equal(heroParts(date, t, null).res, '1:12.6');
  assert.equal(heroParts(date, { ...t, totalMs: 604_700 }, { place: 10, of: 12 }).res, '10:04.7 · 10th of 12');
  const out = heroParts(date, { ...t, out: true, totalMs: null, reached: 12 }, { place: 8, of: 9 });
  assert.equal(out.res, 'Out at 12 · 8th of 9');
  // Narrow, an out's place without "of N".
  assert.equal(out.short, 'Out at 12 · 8th');
  assert.equal(heroParts(date, { ...t, out: true, totalMs: null, reached: 12 }, null).short, 'Out at 12');
  // Started and not ended: another tab's, and what to do.
  const busy = heroParts(date, { started: true, ended: false }, null);
  assert.equal(busy.state, 'busy');
  assert.equal(busy.res, OTHER_TAB);
  assert.equal(busy.label, `Daily challenge, Tue 17 Nov: ${IN_PROGRESS}`);
});

test('the board\'s filled button: Start before today\'s try, Practice after, busy in another tab, none on a past day unplayed', () => {
  const today = '2026-11-17';
  assert.equal(boardButton(today, today, null), 'start');
  assert.equal(boardButton(today, today, { started: true, ended: true }), 'practice');
  assert.equal(boardButton(today, today, { started: true, ended: false }), 'busy');
  // After midnight, yesterday's board.
  assert.equal(boardButton('2026-11-16', today, { started: true, ended: true }), 'practice');
  assert.equal(boardButton('2026-11-16', today, null), 'none');
});

test('a board that fits shows every row and nothing scrolls', () => {
  assert.deepEqual(cutBoard({ count: 9, at: 4, room: 360, row: 40, pinRoom: 68 }), { scrolls: false, shown: 9, pinned: false, start: 0 });
  // Within half a pixel counts as fitting.
  assert.equal(cutBoard({ count: 9, at: 4, room: 359.6, row: 40, pinRoom: 68 }).scrolls, false);
});

test('a long board is a whole number of rows tall, your row pinned only when it is below the view', () => {
  // 7.5 rows of room: 7 rows, you 10th, pinned, the list 5 rows (the pin takes 1.7).
  assert.deepEqual(cutBoard({ count: 12, at: 9, room: 300, row: 40, pinRoom: 68 }), { scrolls: true, shown: 5, pinned: true, start: 0 });
  // You within the 7 the list shows: no pin.
  assert.deepEqual(cutBoard({ count: 12, at: 6, room: 300, row: 40, pinRoom: 68 }), { scrolls: true, shown: 7, pinned: false, start: 0 });
  // Not on the board: no pin.
  assert.deepEqual(cutBoard({ count: 12, at: -1, room: 300, row: 40, pinRoom: 68 }), { scrolls: true, shown: 7, pinned: false, start: 0 });
  // Room for one row only: no room for the pin, so the list opens on yours.
  assert.deepEqual(cutBoard({ count: 12, at: 9, room: 60, row: 40, pinRoom: 68 }), { scrolls: true, shown: 1, pinned: false, start: 9 });
});

test('your row is never hidden, and the pin never comes with a false "⋯"', () => {
  for (let count = 2; count <= 40; count++) {
    for (let at = -1; at < count; at++) {
      for (let room = 40; room <= 600; room += 7) {
        for (const pinRoom of [28, 40, 68]) {
          const cut = cutBoard({ count, at, room, row: 40, pinRoom });
          const at_ = `count ${count}, at ${at}, room ${room}, pin ${pinRoom}: ${JSON.stringify(cut)}`;
          if (!cut.scrolls) {
            assert.ok(count * 40 <= room + 0.5, at_);
            continue;
          }
          if (cut.pinned) {
            // A row really hidden between the last shown and yours.
            assert.ok(at > cut.start + cut.shown, at_);
            assert.equal(cut.start, 0, at_);
          } else if (at >= 0) {
            assert.ok(at >= cut.start && at < cut.start + cut.shown, `you hidden: ${at_}`);
          }
          // The list and the pin fit the room, whole rows.
          assert.ok(cut.shown >= 1 && cut.shown * 40 + (cut.pinned ? pinRoom : 0) <= room + 0.5, at_);
        }
      }
    }
  }
});
