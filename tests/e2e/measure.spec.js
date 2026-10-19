import { test, expect } from '@playwright/test';
import { open, freeze, capture, ink } from './helpers.js';

// Self-test of ink(): the pixel measurement every later layout test relies on.
// A shape is moved by known sub-pixel amounts and ink() must report the same
// movement. This validates the measurement, so the shape is moved with
// `transform`, which paints at a true sub-pixel offset. (Moving text with
// left/top does not work for this: Chrome snaps text placement to device
// pixels vertically and to about 1/4 px horizontally. That snapping is a
// property of the rendering, which the alignment tests measure on purpose.)
// The worst error seen here is what justifies TOL in helpers.js.
const SHIFTS = [0.125, 0.25, 0.5, 1];
const BASES = [100, 100.4];
const MAX_ERROR = 0.1;
const AREA = { left: 40, right: 360, top: 40, bottom: 360 };

// Put `kind` (a solid box or a glyph) at (x, y) CSS px on an overlay that
// hides the page. It is laid out at 100,100 and moved by transform only.
async function place(page, kind, x, y) {
  await page.evaluate(([kind, x, y]) => {
    let host = document.getElementById('measure-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'measure-host';
      host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#12407e';
      const box = document.createElement('div');
      box.id = 'measure-box';
      box.style.cssText = 'position:absolute;left:100px;top:100px;width:120px;height:160px;background:#eef5ff';
      const digit = document.createElement('div');
      digit.id = 'measure-digit';
      digit.textContent = '8';
      digit.style.cssText = 'position:absolute;left:100px;top:100px;font:500 200px/1 "IBM Plex Mono";color:#eef5ff';
      host.append(box, digit);
      document.body.appendChild(host);
    }
    for (const id of ['box', 'digit']) {
      const el = document.getElementById('measure-' + id);
      el.style.display = id === kind ? 'block' : 'none';
      el.style.transform = `translate(${x - 100}px, ${y - 100}px)`;
    }
  }, [kind, x, y]);
}

async function measure(page, kind, x, y) {
  await place(page, kind, x, y);
  const m = ink(await capture(page), AREA);
  expect(m).not.toBeNull();
  return m;
}

// Move `kind` by each shift along each axis from each base; return the worst
// error between the requested and the measured movement (the other axis must
// not move at all).
async function sweep(page, kind) {
  let worst = 0;
  const check = (got, want, what) => {
    const err = Math.abs(got - want);
    worst = Math.max(worst, err);
    expect(err, what).toBeLessThanOrEqual(MAX_ERROR);
  };
  for (const base of BASES) {
    const homeX = await measure(page, kind, base, 100);
    for (const s of SHIFTS) {
      const m = await measure(page, kind, base + s, 100);
      check(m.midX - homeX.midX, s, `${kind}: x base ${base} shift ${s}`);
      check(m.midY - homeX.midY, 0, `${kind}: x base ${base} shift ${s}: midY must not move`);
    }
    const homeY = await measure(page, kind, 100, base);
    for (const s of SHIFTS) {
      const m = await measure(page, kind, 100, base + s);
      check(m.midY - homeY.midY, s, `${kind}: y base ${base} shift ${s}`);
      check(m.midX - homeY.midX, 0, `${kind}: y base ${base} shift ${s}: midX must not move`);
    }
  }
  return worst;
}

test('ink() tracks sub-pixel movement of a solid shape', async ({ page }, info) => {
  await open(page);
  await freeze(page);
  const worst = await sweep(page, 'box');
  console.log(`measure worst error, solid shape [${info.project.name}]: ${worst.toFixed(4)} px`);
});

test('ink() tracks sub-pixel movement of a glyph', async ({ page }, info) => {
  // Desktop Chrome places glyphs on about 1/4 px steps even under transform, so
  // a glyph can't be shifted by arbitrary sub-pixel amounts there.
  test.skip(info.project.name === 'desktop', 'glyphs cannot be shifted by sub-pixel amounts at 1x');
  await open(page);
  await freeze(page);
  await page.evaluate(() => document.fonts.ready);
  const worst = await sweep(page, 'digit');
  console.log(`measure worst error, glyph [${info.project.name}]: ${worst.toFixed(4)} px`);
});

test('ink() returns null for an empty, off-screen or inkless area', async ({ page }) => {
  await open(page);
  await freeze(page);
  await place(page, 'box', 100, 100);
  const shot = await capture(page);
  expect(ink(shot, { left: 10, right: 10, top: 10, bottom: 50 })).toBeNull();
  expect(ink(shot, { left: -50, right: -10, top: 10, bottom: 50 })).toBeNull();
  expect(ink(shot, { left: 5000, right: 5100, top: 10, bottom: 50 })).toBeNull();
  expect(ink(shot, { left: 0, right: 30, top: 0, bottom: 30 })).toBeNull();
});
