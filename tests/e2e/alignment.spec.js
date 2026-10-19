import { test, expect } from '@playwright/test';
import { open, freeze, setProblem, rect, capture, ink, TOL } from './helpers.js';

// The digit ink band is the union of all ten digits (spec §6), so render the
// digits in pairs and combine their ink.
async function digitBand(page) {
  let top = Infinity, bottom = -Infinity;
  for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]]) {
    await setProblem(page, a, b);
    const shot = await capture(page);
    for (const sel of ['#a', '#b']) {
      const r = await rect(page, sel);
      const box = ink(shot, { ...r, top: r.top - 4, bottom: r.bottom + 4 });
      top = Math.min(top, box.top);
      bottom = Math.max(bottom, box.bottom);
    }
  }
  return { top, bottom, mid: (top + bottom) / 2 };
}

// The answer box's outer edges, measured from pixels (it is a pseudo-element).
async function boxEdges(page, shot) {
  const s = await rect(page, '#slot');
  const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#eq')).fontSize));
  return ink(shot, { left: s.left - 2, right: s.right + 2, top: s.top - fs / 2, bottom: s.bottom + fs / 2 });
}

test.beforeEach(async ({ page }) => {
  await open(page);
  await freeze(page);
});

test('box and operators are centred on the digit ink', async ({ page }) => {
  const digits = await digitBand(page);
  const shot = await capture(page);
  const box = await boxEdges(page, shot);
  expect(Math.abs(box.midY - digits.mid)).toBeLessThanOrEqual(TOL);
  for (const i of [0, 1]) {
    const op = ink(shot, await rect(page, '.op', i), [182, 205, 238]);   // muted #b6cdee
    expect(Math.abs(op.midY - digits.mid)).toBeLessThanOrEqual(TOL);
  }
});

test('the caret reaches the digit ink at both ends, never short', async ({ page }) => {
  const digits = await digitBand(page);
  const caret = await rect(page, '.caret');
  const dpr = await page.evaluate(() => devicePixelRatio);
  expect(caret.top).toBeLessThanOrEqual(digits.top + 0.01);
  expect(caret.top).toBeGreaterThan(digits.top - 1 / dpr - 0.01);
  expect(caret.bottom).toBeGreaterThanOrEqual(digits.bottom - 0.01);
  expect(caret.bottom).toBeLessThan(digits.bottom + 1 / dpr + 0.01);
});

// Show an answer in the box directly (typing itself is tested in flows.spec.js).
const showAnswer = (page, typed) => page.evaluate(t => {
  const { game, view } = window.mathtime;
  game.state.typed = t;
  view.renderAnswer(t);
}, typed);

test('every possible answer is ink-centred in the box, and wide wrong entries fit', async ({ page }) => {
  const bw = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#eq')).getPropertyValue('--bw')));
  const outer = await boxEdges(page, await capture(page));
  const inner = { left: outer.left + bw + 1, right: outer.right - bw - 1, top: outer.top + bw + 1, bottom: outer.bottom - bw - 1 };
  const centre = (outer.left + outer.right) / 2;
  for (let n = 0; n <= 18; n++) {
    await showAnswer(page, String(n));
    const answer = ink(await capture(page), inner);
    expect(Math.abs(answer.midX - centre), `answer ${n}`).toBeLessThanOrEqual(TOL);
  }
  for (const wide of ['44', '88']) {
    await showAnswer(page, wide);
    const answer = ink(await capture(page), inner);
    expect(answer.left).toBeGreaterThanOrEqual(outer.left + bw);
    expect(answer.right).toBeLessThanOrEqual(outer.right - bw);
  }
});

test('keypad digit labels are centred on their ink', async ({ page }) => {
  const shot = await capture(page);
  for (const k of '0123456789') {
    const r = await rect(page, `.pad button[data-k="${k}"]`);
    const label = ink(shot, { left: r.left + 4, right: r.right - 4, top: r.top + 4, bottom: r.bottom - 4 });
    expect(Math.abs(label.midY - (r.top + r.height / 2)), `key ${k} vertical`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(label.midX - (r.left + r.width / 2)), `key ${k} horizontal`).toBeLessThanOrEqual(TOL);
  }
});

test('gutters hold, overhang included, with no horizontal scroll', async ({ page }) => {
  const g = await page.evaluate(() => {
    const eq = document.querySelector('#eq');
    const e = eq.getBoundingClientRect();
    const s = document.querySelector('.stage').getBoundingClientRect();
    const over = parseFloat(getComputedStyle(eq).getPropertyValue('--overhang')) || 0;
    return { left: e.left - s.left, right: s.right - (e.right + over), scroll: document.documentElement.scrollWidth - innerWidth, phone: innerWidth <= 480 };
  });
  const min = g.phone ? 16 : 24;
  expect(g.left).toBeGreaterThanOrEqual(min - 0.01);
  expect(g.right).toBeGreaterThanOrEqual(min - 0.01);
  expect(g.scroll).toBeLessThanOrEqual(0);
});

test('the header stays on one line at 320px wide', async ({ page }) => {
  // Note: setViewportSize drops the phone project to 1x; this test measures no pixels.
  await page.setViewportSize({ width: 320, height: 640 });
  await expect.poll(() => page.evaluate(() => {
    const where = document.querySelector('.where');
    return document.querySelector('.crumbs').scrollWidth <= where.clientWidth;
  })).toBe(true);
  await expect(page.locator('.crumbs .here')).toBeVisible();
});
