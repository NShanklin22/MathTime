import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecord } from '../../src/record.js';

// A finished run's result, as game.js gives it: times as the clock gave them.
const result = () => ({
  level: 2,
  totalMs: 72412.6,
  misses: 1,
  problems: Array.from({ length: 20 }, (_, i) => ({ a: 9, b: i % 10, ms: 1000.4 + i, misses: i === 3 ? 1 : 0 })),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('a record is the result with its id and finish time, times in whole ms (runs spec §5)', () => {
  const record = buildRecord(result(), { id: 'run-1', finishedAt: new Date(Date.UTC(2026, 10, 1, 9, 30, 0, 250)) });
  assert.deepEqual(record, {
    id: 'run-1',
    level: 2,
    finishedAt: '2026-11-01T09:30:00.250Z',
    totalMs: 72413,
    misses: 1,
    problems: result().problems.map(({ a, b, ms, misses }) => ({ a, b, ms: Math.round(ms), misses })),
  });
  assert.deepEqual(record.problems[3], { a: 9, b: 3, ms: 1003, misses: 1 });
  assert.deepEqual(Object.keys(record), ['id', 'level', 'finishedAt', 'totalMs', 'misses', 'problems']);
});

test('by default each record gets its own UUID, and finishes now', () => {
  const before = Date.now();
  const one = buildRecord(result());
  const two = buildRecord(result());
  const after = Date.now();
  assert.match(one.id, UUID);
  assert.match(two.id, UUID);
  assert.notEqual(one.id, two.id);
  const at = Date.parse(one.finishedAt);
  assert.ok(before <= at && at <= after, one.finishedAt);
  assert.match(one.finishedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});

test('a record is plain data of its own: changing the result later leaves it as it was', () => {
  const source = result();
  const record = buildRecord(source, { id: 'run-1', finishedAt: new Date(0) });
  source.problems[0].a = 5;
  source.problems.push({ a: 1, b: 1, ms: 1, misses: 0 });
  assert.equal(record.problems[0].a, 9);
  assert.equal(record.problems.length, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
});
