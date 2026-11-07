import { test } from 'node:test';
import assert from 'node:assert/strict';
import { penGeometry, strikeGeometry, TIMING, LOCK_MS, RED_MS } from '../../src/fx.js';

// The feedback's geometry (docs/superpowers/specs/2026-11-06-animations-mockup.html,
// "New"): every edge on a whole device pixel, at every pixel ratio the
// game is checked at.
const RATIOS = [1, 1.25, 1.5, 2, 3];
const onPixel = (v, dpr, what) => assert.ok(Math.abs(v * dpr - Math.round(v * dpr)) < 1e-6, `${what} ${v} is on a device pixel at ${dpr}x`);

test('the timings are the mockup\'s: a 320ms lock, a 500ms red-line', () => {
  assert.equal(TIMING.trace, 150);
  assert.equal(TIMING.hold, 240);           // the trace, then the closed frame held 90ms
  assert.equal(TIMING.out, 80);
  assert.equal(TIMING.in, 120);
  assert.equal(LOCK_MS, 320);
  assert.equal(TIMING.draw, 140);
  assert.equal(RED_MS, 500);
  assert.equal(TIMING.still, 400);
});

for (const dpr of RATIOS) {
  test(`the pen's frame covers the border box on whole device pixels at ${dpr}x`, () => {
    const bw = Math.max(1, Math.floor(2.4 * dpr)) / dpr;
    const g = penGeometry({ left: 100.37, top: 41.81, right: 233.02, bottom: 160.49 }, bw, dpr);
    for (const [k, v] of Object.entries({ left: g.left, top: g.top, w: g.w, h: g.h })) onPixel(v, dpr, k);
    assert.ok(Math.abs(g.left - 100.37) <= 0.5 / dpr + 1e-9);
    assert.ok(Math.abs(g.left + g.w - 233.02) <= 0.5 / dpr + 1e-9);
    // A border of whole device pixels: the pen is exactly its width, on its
    // centre line, from the start, with no overhang to soften its edges.
    assert.equal(g.from, bw);
    assert.equal(g.to, bw);
    // Clockwise from the top left corner's outer edge, closing over itself.
    const c = bw / 2;
    assert.equal(g.d, `M0 ${c}H${g.w - c}V${g.h - c}H${c}V0`);
    assert.ok(Math.abs(g.len - ((g.w - c) + (g.h - 2 * c) + (g.w - 2 * c) + (g.h - c))) < 1e-9);
  });

  test(`a border off the device pixel grid gets a pen one device pixel wider at ${dpr}x`, () => {
    const bw = 2.3 / dpr;
    const g = penGeometry({ left: 10, top: 10, right: 90, bottom: 60 }, bw, dpr);
    const e = 0.5 / dpr;
    assert.ok(g.from <= 2 + 1e-9);
    assert.ok(Math.abs(g.to - (bw + 1 / dpr)) < 1e-9);
    assert.match(g.d, /^M-[\d.]+ [\d.]+H[\d.]+V[\d.]+H[\d.]+V-[\d.]+$/);
    const c = bw / 2;
    assert.ok(Math.abs(g.len - ((g.w - c + e) + (g.h - 2 * c) + (g.w - 2 * c) + (g.h - c + e))) < 1e-9);
  });

  test(`the strike is ~0.07em of whole device pixels with a 1 device px halo at ${dpr}x`, () => {
    const size = 96;
    const s = strikeGeometry({ left: 50.3, right: 120.9, mid: 77.77, size }, dpr);
    for (const [k, v] of Object.entries({ left: s.left, top: s.top, W: s.W, H: s.H, sw: s.sw })) onPixel(v, dpr, k);
    assert.ok(Math.abs(s.halo - 1 / dpr) < 1e-9, 'the halo is one device pixel');
    assert.ok(Math.abs(s.sw - 0.07 * size) <= 0.5 / dpr + 1e-9);
    assert.ok(Math.abs(s.H - (s.sw + 2 * s.halo)) < 1e-9);
    // Past the ink by 4px at each end, centred on its middle.
    assert.ok(s.left + s.halo <= 50.3 - 4 + 0.5 / dpr + 1e-9);
    assert.ok(s.left + s.W - s.halo >= 120.9 + 4 - 0.5 / dpr - 1e-9);
    assert.ok(Math.abs(s.top + s.H / 2 - 77.77) <= 0.5 / dpr + 1e-9);
  });
}

for (const dpr of RATIOS) {
  test(`a strike kept inside a cell stays clear of its frame, halo too, at ${dpr}x`, () => {
    const s = strikeGeometry({ left: 20.2, right: 60.7, mid: 40, size: 80, inside: { left: 18, right: 63 } }, dpr);
    onPixel(s.left, dpr, 'left');
    onPixel(s.W, dpr, 'W');
    assert.ok(s.left >= 18 - 1e-9, `${s.left} inside 18`);
    assert.ok(s.left + s.W <= 63 + 1e-9, `${s.left + s.W} inside 63`);
    // Unbounded where the ink leaves room.
    const free = strikeGeometry({ left: 30, right: 50, mid: 40, size: 80, inside: { left: 0, right: 100 } }, dpr);
    const plain = strikeGeometry({ left: 30, right: 50, mid: 40, size: 80 }, dpr);
    assert.deepEqual(free, plain);
  });
}

test('a tiny strike is still one device pixel thick', () => {
  const s = strikeGeometry({ left: 0, right: 10, mid: 5, size: 4 }, 1);
  assert.equal(s.sw, 1);
});
