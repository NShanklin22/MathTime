import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgesFromAlpha, toMetrics, centreInk, band, snapOutward, snap } from '../../src/ink.js';

// RGBA pixel data where paint(set) sets alpha values.
function pixels(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  paint((x, y, a) => { data[(y * width + x) * 4 + 3] = a; });
  return data;
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test('edgesFromAlpha finds solid edges on whole pixels', () => {
  const d = pixels(10, 10, set => {
    for (let y = 3; y <= 6; y++) for (let x = 2; x <= 5; x++) set(x, y, 255);
  });
  assert.deepEqual(edgesFromAlpha(d, 10, 10), { top: 3, bottom: 7, left: 2, right: 6 });
});

test('edgesFromAlpha uses edge coverage for sub-pixel precision', () => {
  const d = pixels(10, 10, set => {
    for (let x = 2; x <= 5; x++) set(x, 2, 128);          // half-covered top row
    for (let y = 3; y <= 6; y++) for (let x = 2; x <= 5; x++) set(x, y, 255);
  });
  close(edgesFromAlpha(d, 10, 10).top, 3 - 128 / 255);
});

test('edgesFromAlpha returns null when nothing is drawn', () => {
  assert.equal(edgesFromAlpha(pixels(4, 4, () => {}), 4, 4), null);
});

test('toMetrics converts edges around an origin into em', () => {
  const m = toMetrics({ top: 10, bottom: 52, left: 5, right: 35 }, 10, 50, 40, 32);
  assert.deepEqual(m, { asc: 1, desc: 0.05, abl: 0.125, abr: 0.625, adv: 0.8 });
});

test('centreInk centres the ink, not the advance, across a width', () => {
  const g = centreInk({ abl: -0.05, abr: 0.5 }, 1);
  close(g.off, 0.225);
  close(g.right, 0.725);
  close(g.w, 0.45);
  close(g.off - -0.05 + g.w / 2, 0.5);   // ink left + half ink width = centre
});

test('band gives the ink span around a baseline', () => {
  const b = band({ asc: 0.7, desc: 0.02 }, 0.8);
  close(b.top, 0.1);
  close(b.h, 0.72);
  close(b.mid, 0.46);
});

test('snapOutward grows a span to whole device pixels', () => {
  assert.deepEqual(snapOutward(10.3, 20.2, 1), { top: 10, bottom: 21 });
  assert.deepEqual(snapOutward(10.3, 20.2, 2), { top: 10, bottom: 20.5 });
  assert.deepEqual(snapOutward(10, 20, 2), { top: 10, bottom: 20 });
});

test('snap rounds to the nearest device pixel', () => {
  assert.equal(snap(10.26, 2), 10.5);
  assert.equal(snap(10.24, 1), 10);
});
