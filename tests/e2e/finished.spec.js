import { test, expect } from '@playwright/test';
import { open, levelRow, finishRun, rect, resize, setProblem, typeKeys, GOOD, INK } from './helpers.js';

// The finished-level mark (finished-mark spec): a finished level's row
// shows a green check and its best time in place of its sample.

// Runs kept before the page loads, as the finish screen keeps them.
const keptBefore = (page, records) => page.addInitScript(r => localStorage.setItem('mathtime.runs', JSON.stringify(r)), records);
const earlier = (level, totalMs) => ({
  id: `earlier-${level}-${totalMs}`, level, finishedAt: '2026-11-01T09:30:00.000Z', totalMs, misses: 0, problems: [],
});
async function home(page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
}
const result = (page, n) => levelRow(page, n).locator('.result');
const rgb = c => `rgb(${c.join(', ')})`;

test('with no run finished, every row keeps its sample and shows no mark', async ({ page }) => {
  await home(page);
  for (const n of [1, 2]) {
    await expect(levelRow(page, n)).not.toHaveClass(/\bfinished\b/);
    await expect(levelRow(page, n).locator('.sample')).toBeVisible();
    await expect(result(page, n)).toBeHidden();
  }
  await expect(levelRow(page, 1)).toHaveAttribute('aria-label', 'Level 1: Single-digit addition');
});

test('a finished level shows a green check and its best time in place of its sample; the others don\'t', async ({ page }) => {
  await keptBefore(page, [earlier(1, 80_000), earlier(1, 72_400)]);
  await home(page);
  const row = levelRow(page, 1);
  await expect(row).toHaveClass(/\bfinished\b/);
  await expect(row.locator('.sample')).toBeHidden();
  await expect(result(page, 1)).toBeVisible();
  await expect(result(page, 1)).toHaveAttribute('aria-hidden', 'true');
  await expect(result(page, 1).locator('.best')).toHaveText('1:12.4');
  await expect(result(page, 1).locator('.tick')).toHaveCSS('color', rgb(GOOD));
  await expect(result(page, 1).locator('.best')).toHaveCSS('font-size', '13px');
  await expect(result(page, 1).locator('.best')).toHaveCSS('color', rgb(INK));
  await expect(row).toHaveAttribute('aria-label', 'Level 1: Single-digit addition. Finished, best 1:12.4.');
  await expect(page.getByRole('button', { name: 'Level 1: Single-digit addition. Finished, best 1:12.4.' })).toBeVisible();
  await expect(levelRow(page, 2)).not.toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 2).locator('.sample')).toBeVisible();
  await expect(result(page, 2)).toBeHidden();
});

test('a run just finished shows on its row when you come back by "Levels"', async ({ page }) => {
  await open(page, 2);
  await finishRun(page);
  const time = await page.locator('.finish .done-time').textContent();
  await page.locator('.finish .levels').click();
  await expect(page.locator('.select')).toBeVisible();
  await expect(result(page, 2).locator('.best')).toHaveText(time);
  await expect(levelRow(page, 2)).toHaveAttribute('aria-label', `Level 2: Subtraction within 10. Finished, best ${time}.`);
  await expect(levelRow(page, 1)).not.toHaveClass(/\bfinished\b/);
});

test('a run just finished shows on its row when you come back by running out of lives', async ({ page }) => {
  await open(page);
  await finishRun(page);
  const time = await page.locator('.finish .done-time').textContent();
  await page.keyboard.press('Enter');                    // "Again"
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  await setProblem(page, 3, 4);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('.select')).toBeVisible();
  await expect(result(page, 1).locator('.best')).toHaveText(time);
});

test('a run that runs out of lives leaves no mark', async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 1)).not.toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 1).locator('.sample')).toBeVisible();
});

test('with storage blocked, no row is marked and a level still starts', async ({ page }) => {
  await page.addInitScript(() => {
    const refuse = () => { throw new DOMException('Storage is blocked (test)', 'SecurityError'); };
    Storage.prototype.getItem = refuse;
    Storage.prototype.setItem = refuse;
  });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await home(page);
  await expect(page.locator('.select .row.finished')).toHaveCount(0);
  await levelRow(page, 1).click();
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  expect(errors).toEqual([]);
});

// The mark mirrors the title and name: the check level with the title's
// capitals and as tall, the time level with the name's, both right-aligned
// at the row's 24px padding, and clear of the name, a long time too.
for (const [width, height] of [[375, 812], [320, 640], [1440, 900]]) test(`at ${width}×${height} the check is on the title's line, the time on the name's, right-aligned`, async ({ page }) => {
  await keptBefore(page, [earlier(1, 729_100), earlier(2, 95_000)]);
  await home(page);
  await resize(page, width, height);
  for (const n of [1, 2]) {
    const row = `.select .row[data-level="${n}"]`;
    const [r, title, name, tick, best] = await Promise.all(['', ' .title', ' .name', ' .tick', ' .best'].map(s => rect(page, row + s)));
    // The time's box holds its last letter's spacing too: less that, it
    // ends at its last digit, and that is what sits at the padding.
    const spacing = await page.evaluate(sel => parseFloat(getComputedStyle(document.querySelector(sel)).letterSpacing) || 0, `${row} .best`);
    expect(Math.abs(tick.top - title.top), `Level ${n}: check on the title's line`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(tick.height - title.height), `Level ${n}: check as tall as the capitals`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(best.top - name.top), `Level ${n}: time on the name's line`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(best.height - name.height), `Level ${n}: time as tall as the name`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(r.right - 24 - tick.right), `Level ${n}: check at the padding`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(r.right - 24 - (best.right - spacing)), `Level ${n}: time at the padding`).toBeLessThanOrEqual(0.05);
    expect(best.left - name.right, `Level ${n}: time clear of the name`).toBeGreaterThanOrEqual(8);
  }
});
