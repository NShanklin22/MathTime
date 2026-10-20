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

test('edgesFromAlpha takes the maximum alpha across an edge row', () => {
  const d = pixels(10, 10, set => {
    set(2, 2, 40); set(3, 2, 200); set(4, 2, 90);          // uneven top row: max is 200
    for (let y = 3; y <= 6; y++) for (let x = 2; x <= 5; x++) set(x, y, 255);
  });
  close(edgesFromAlpha(d, 10, 10).top, 3 - 200 / 255);
});

test('edgesFromAlpha returns null when nothing is drawn', () => {
  assert.equal(edgesFromAlpha(pixels(4, 4, () => {}), 4, 4), null);
});

test('edgesFromAlpha uses coverage on the bottom, left and right edges too', () => {
  const d = pixels(10, 10, set => {
    for (let y = 3; y <= 6; y++) for (let x = 2; x <= 5; x++) set(x, y, 255);
    for (let x = 2; x <= 5; x++) set(x, 7, 51);            // bottom row, 20% covered
    for (let y = 3; y <= 6; y++) { set(1, y, 102); set(6, y, 153); }  // left 40%, right 60%
  });
  const e = edgesFromAlpha(d, 10, 10);
  close(e.bottom, 7 + 51 / 255);
  close(e.left, 2 - 102 / 255);
  close(e.right, 6 + 153 / 255);
});

test('edgesFromAlpha handles ink touching the canvas border', () => {
  const d = pixels(4, 3, set => {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) set(x, y, 255);
  });
  assert.deepEqual(edgesFromAlpha(d, 4, 3), { top: 0, bottom: 3, left: 0, right: 4 });
});

test('edgesFromAlpha handles a single solid pixel', () => {
  const d = pixels(5, 5, set => set(2, 3, 255));
  assert.deepEqual(edgesFromAlpha(d, 5, 5), { top: 3, bottom: 4, left: 2, right: 3 });
});

test('edgesFromAlpha ignores alpha below the min threshold', () => {
  const d = pixels(6, 6, set => { set(0, 0, 3); set(2, 2, 255); set(5, 5, 3); });
  assert.deepEqual(edgesFromAlpha(d, 6, 6), { top: 2, bottom: 3, left: 2, right: 3 });
  assert.equal(edgesFromAlpha(pixels(3, 3, set => set(1, 1, 3)), 3, 3), null);
});

test('toMetrics converts edges around an origin into em', () => {
  const m = toMetrics({ top: 10, bottom: 52, left: 5, right: 35 }, 10, 50, 40, 32);
  assert.deepEqual(m, { asc: 1, desc: 0.05, abl: 0.125, abr: 0.625, adv: 0.8 });
});

test('centreInk centres the ink, not the advance, across a width', () => {
  const m = { abl: -0.05, abr: 0.5 };
  const width = 1;
  const g = centreInk(m, width);
  close(g.off, 0.225);
  close(g.right, 0.725);
  close(g.w, 0.45);
  close(g.off - m.abl + g.w / 2, width / 2);   // ink left + half ink width = centre
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

test('snapOutward grows a span with a negative top outward (away from zero)', () => {
  assert.deepEqual(snapOutward(-30.3, 0.4, 2), { top: -30.5, bottom: 0.5 });
});

test('snapOutward absorbs float noise so an exact boundary is not pushed out', () => {
  // 0.1 + 0.2 is 0.30000000000000004; at dpr 10 the bottom is 3 device px, not 4.
  assert.deepEqual(snapOutward(0, 0.1 + 0.2, 10), { top: 0, bottom: 0.3 });
});

test('snapOutward never returns negative zero', () => {
  assert.deepEqual(snapOutward(-1, -0.0004, 1), { top: -1, bottom: 0 });   // ceil(-0.0014) is -0
});

test('snap rounds to the nearest device pixel', () => {
  assert.equal(snap(10.26, 2), 10.5);
  assert.equal(snap(10.24, 1), 10);
});

test('snap rounds ties toward +Infinity, also below zero', () => {
  assert.equal(snap(-1.25, 2), -1);
  assert.equal(snap(-0.75, 2), -0.5);
});

test('snap never returns negative zero', () => {
  assert.equal(snap(-0.2, 1), 0);   // strict equal compares with Object.is, so -0 would fail
});
