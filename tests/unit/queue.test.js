import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../../src/queue.js';

// An in-memory stand-in for localStorage.
const memory = () => {
  const items = new Map();
  return {
    items,
    getItem: key => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
  };
};
// Storage that refuses everything, as when it is blocked.
const blocked = {
  getItem() { throw new Error('blocked (test)'); },
  setItem() { throw new Error('blocked (test)'); },
};
const run = (level, totalMs) => ({
  id: `${level}-${totalMs}`, level, finishedAt: '2026-11-01T09:30:00.000Z', totalMs, misses: 0, problems: [],
});
const kept = storage => JSON.parse(storage.items.get('mathtime.runs'));

test('finished runs are kept in the order they finished, under "mathtime.runs"', () => {
  const storage = memory();
  const queue = createQueue(storage);
  assert.equal(queue.add(run(1, 72400)), true);
  assert.equal(queue.add(run(2, 65000)), true);
  assert.deepEqual(kept(storage), [run(1, 72400), run(2, 65000)]);
});

test('the runs outlast the page: a new queue on the same storage finds them', () => {
  const storage = memory();
  createQueue(storage).add(run(1, 72400));
  const later = createQueue(storage);
  assert.equal(later.best(1), 72400);
  later.add(run(1, 70000));
  assert.deepEqual(kept(storage), [run(1, 72400), run(1, 70000)]);
});

test('the best is the fastest kept time of that level, or null when it has none', () => {
  const queue = createQueue(memory());
  assert.equal(queue.best(1), null);
  for (const r of [run(1, 72400), run(2, 50000), run(1, 68900), run(1, 75000)]) queue.add(r);
  assert.equal(queue.best(1), 68900);
  assert.equal(queue.best(2), 50000);
  assert.equal(queue.best(3), null);
});

test('contents that are not a list of runs count as empty, and the next run replaces them', () => {
  for (const junk of ['{nope', '{"level":1}', 'null', '42']) {
    const storage = memory();
    storage.setItem('mathtime.runs', junk);
    const queue = createQueue(storage);
    assert.equal(queue.best(1), null, junk);
    queue.add(run(1, 72400));
    assert.deepEqual(kept(storage), [run(1, 72400)], junk);
  }
});

test('entries of the wrong shape are passed over for the best', () => {
  const storage = memory();
  storage.setItem('mathtime.runs', JSON.stringify([null, { level: 1 }, { level: 1, totalMs: 'fast' }, run(1, 72400)]));
  assert.equal(createQueue(storage).best(1), 72400);
});

test('with storage blocked or missing, nothing is kept and nothing throws', () => {
  for (const storage of [blocked, null]) {
    const queue = createQueue(storage);
    assert.equal(queue.add(run(1, 72400)), false);
    assert.equal(queue.best(1), null);
  }
});
