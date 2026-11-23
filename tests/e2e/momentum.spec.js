import { test, expect } from './fixtures.js';
import { open, playTo, answer, typeKeys } from './helpers.js';

// Momentum (docs/superpowers/specs/2026-11-23-momentum-design.md): the run
// bar in four groups of five, a group's flash, the streak's glow, and a
// quicker lock on a streak.

const bar = page => page.evaluate(() => [...document.querySelectorAll('.run span')].map(s => ({
  done: s.classList.contains('done'),
  hot: ['hot1', 'hot2', 'hot3'].find(c => s.classList.contains(c)) ?? null,
  flash: s.getAnimations().some(a => a.id === 'flash'),
  left: s.getBoundingClientRect().left, right: s.getBoundingClientRect().right,
})));

async function missOnce(page) {
  const right = await page.evaluate(() => window.mathtime.game.state.problem.answer);
  await typeKeys(page, [String((right + 1) % 10), 'Enter']);
}

// Answer the problem on screen and wait for the next one.
async function next(page) {
  const q = await page.evaluate(() => window.mathtime.game.state.question);
  await answer(page);
  await page.waitForFunction(q => window.mathtime.game.state.question === q + 1 && window.mathtime.game.state.phase === 'playing', q);
}

test('the bar is four groups of five: 2px between segments, 8px between groups', async ({ page }) => {
  await open(page);
  const segs = await bar(page);
  expect(segs).toHaveLength(20);
  for (let i = 1; i < 20; i++) {
    const gap = segs[i].left - segs[i - 1].right;
    expect(Math.abs(gap - (i % 5 === 0 ? 8 : 2)), `gap before segment ${i + 1}: ${gap}`).toBeLessThan(0.6);
  }
});

test('the fifth right answer flashes its group; from 3 in a row the streak glows, more at 6; a miss cools it', async ({ page }) => {
  await open(page);
  await playTo(page, 3);                      // 2 right, by the handle
  let segs = await bar(page);
  expect(segs.filter(s => s.hot)).toHaveLength(0);
  await next(page);                           // 3 in a row
  segs = await bar(page);
  expect(segs.slice(0, 3).map(s => s.hot)).toEqual(['hot1', 'hot1', 'hot1']);
  await next(page);
  await answer(page);                         // the 5th: its group flashes
  await expect.poll(async () => (await bar(page)).slice(0, 5).every(s => s.flash)).toBe(true);
  segs = await bar(page);
  expect(segs.slice(5).some(s => s.flash)).toBe(false);
  await page.waitForFunction(() => window.mathtime.game.state.question === 6 && window.mathtime.game.state.phase === 'playing');
  await next(page);                           // 6 in a row
  segs = await bar(page);
  expect(segs.slice(0, 6).every(s => s.hot === 'hot2')).toBe(true);
  await missOnce(page);
  segs = await bar(page);
  expect(segs.filter(s => s.hot)).toHaveLength(0);
  expect(segs.filter(s => s.done)).toHaveLength(6);
  await next(page);                           // a new streak, 1
  for (let i = 0; i < 2; i++) await next(page);
  segs = await bar(page);
  expect(segs.map(s => s.hot).slice(0, 9)).toEqual([null, null, null, null, null, null, 'hot1', 'hot1', 'hot1']);
});

test('ten in a row: the lock is 140ms', async ({ page }) => {
  await open(page);
  await playTo(page, 11);                     // 10 right
  await expect(page.locator('.run span.hot3')).toHaveCount(10);
  const right = await page.evaluate(() => window.mathtime.game.state.problem.answer);
  for (const d of String(right)) await page.keyboard.press(d);
  const swap = await page.evaluate(() => new Promise(resolve => {
    const { game } = window.mathtime;
    const next = game.next;
    let t0;
    game.next = () => { game.next = next; resolve(performance.now() - t0); next(); };
    t0 = performance.now();
    document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  }));
  expect(Math.abs(swap - 140), `swap at ${swap}ms`).toBeLessThanOrEqual(40);
});

test('under reduced motion, no flash', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await playTo(page, 5);
  await answer(page);
  await page.waitForFunction(() => window.mathtime.game.state.solved === 5);
  expect((await bar(page)).some(s => s.flash)).toBe(false);
});
