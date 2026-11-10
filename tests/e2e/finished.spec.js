import { test, expect } from './fixtures.js';
import { open, levelRow, finishRun, rect, resize, setProblem, typeKeys, GOOD, INK } from './helpers.js';

// The finished-level mark (finished-mark spec): a finished level's row
// shows a green check and its best time in place of its sample.

// Runs kept before the page loads, as the finish screen keeps them.
const keptBefore = (page, records) => page.addInitScript(r => localStorage.setItem('mathtime.runs', JSON.stringify(r)), records);
const earlier = (level, totalMs) => ({
  id: `earlier-${level}-${totalMs}`, level, finishedAt: '2026-11-01T09:30:00.000Z', totalMs, misses: 0, problems: [{ a: 1, b: 2, ms: totalMs, misses: 0 }],
});
async function home(page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
}
const result = (page, n) => levelRow(page, n).locator('.result');
const rgb = c => `rgb(${c.join(', ')})`;

test('with no run finished, every row keeps its sample and shows no mark', async ({ page }) => {
  await home(page);
  for (const n of [1, 2, 3, 4, 5]) {
    await expect(levelRow(page, n)).not.toHaveClass(/\bfinished\b/);
    await expect(levelRow(page, n).locator('.sample')).toBeVisible();
    await expect(result(page, n)).toBeHidden();
  }
  await expect(levelRow(page, 1)).toHaveAttribute('aria-label', 'Addition, Level 1: Single-digit addition');
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
  await expect(row).toHaveAttribute('aria-label', 'Addition, Level 1: Single-digit addition. Finished, best 1:12.4.');
  await expect(page.getByRole('button', { name: 'Addition, Level 1: Single-digit addition. Finished, best 1:12.4.', exact: true })).toBeVisible();
  await expect(levelRow(page, 2)).not.toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 2).locator('.sample')).toBeVisible();
  await expect(result(page, 2)).toBeHidden();
});

// Runs are kept by the level's build order (level: n), which the numbering
// within topics leaves alone: a run kept for Level 6 is Addition's second
// level's, its "Level 2" row, not Subtraction's "Level 2" (Level 3) nor
// any row numbered 6.
test('a run kept for Level 6 shows as the best time of Addition\'s "Level 2" row', async ({ page }) => {
  await keptBefore(page, [earlier(6, 199_900)]);
  await home(page);
  const addition = page.locator('.select .group[data-topic="Addition"]');
  const row = addition.locator('.row').filter({ has: page.locator('.title', { hasText: /^Level 2$/ }) });
  await expect(row).toHaveCount(1);
  await expect(row).toHaveClass(/\bfinished\b/);
  await expect(row.locator('.name')).toHaveText('Column addition');
  await expect(row.locator('.best')).toHaveText('3:19.9');
  await expect(row).toHaveAttribute('aria-label', 'Addition, Level 2: Column addition. Finished, best 3:19.9.');
  await expect(page.getByRole('button', { name: 'Addition, Level 2: Column addition. Finished, best 3:19.9.', exact: true })).toBeVisible();
  // Every other row is unfinished: no row takes the run by its number.
  await expect(page.locator('.select .row.finished')).toHaveCount(1);
  await expect(page.locator('.select .group[data-topic="Subtraction"] .row').nth(1)).not.toHaveClass(/\bfinished\b/);
  await expect(page.locator('.select .row .title', { hasText: '6' })).toHaveCount(0);
});

test('a run just finished shows on its row when you come back by "Levels"', async ({ page }) => {
  await open(page, 2);
  await finishRun(page);
  const time = await page.locator('.finish .done-time').textContent();
  await page.locator('.finish .levels').click();
  await expect(page.locator('.select')).toBeVisible();
  await expect(result(page, 2).locator('.best')).toHaveText(time);
  await expect(levelRow(page, 2)).toHaveAttribute('aria-label', `Subtraction, Level 1: Subtraction within 10. Finished, best ${time}.`);
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
// capitals and as tall, the time level with the name's, the check's box
// right-aligned at the row's padding (24px; 20px in topic columns,
// 1366×657 and 1440×900), and the time clear of the name,
// a long time too. (The time is moved onto its ink at the padding by the
// selector's layout: selector.spec.js checks it there.) The phones' sizes
// stand for phones, whose overlay scrollbars take no room, so the desktop
// project, whose real scrollbars do, emulates a phone there: the list's
// scrollbar is hidden, as selector.spec.js does at 340 and 320. (A desktop
// window can be this narrow too, at 400% zoom; that is not this case.)
for (const [width, height] of [[375, 812], [320, 640], [1366, 657], [1440, 900]]) test(`at ${width}×${height} the check is on the title's line, the time on the name's, right-aligned`, async ({ page }) => {
  await keptBefore(page, [earlier(1, 729_100), earlier(2, 95_000), earlier(3, 101_300), earlier(4, 138_600), earlier(5, 117_900)]);
  await home(page);
  if (width <= 480 && test.info().project.name === 'desktop') await page.addStyleTag({ content: '.select { scrollbar-width: none !important; }' });
  await resize(page, width, height);
  for (const n of [1, 2, 3, 4, 5]) {
    const row = `.select .row[data-level="${n}"]`;
    const [r, title, name, tick, best] = await Promise.all(['', ' .title', ' .name', ' .tick', ' .best'].map(s => rect(page, row + s)));
    const padding = await page.locator(row).evaluate(el => parseFloat(getComputedStyle(el).paddingRight));
    expect(Math.abs(tick.top - title.top), `Level ${n}: check on the title's line`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(tick.height - title.height), `Level ${n}: check as tall as the capitals`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(best.top - name.top), `Level ${n}: time on the name's line`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(best.height - name.height), `Level ${n}: time as tall as the name`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(r.right - padding - tick.right), `Level ${n}: check at the padding`).toBeLessThanOrEqual(0.05);
    expect(best.left - name.right, `Level ${n}: time clear of the name`).toBeGreaterThanOrEqual(8);
  }
});
