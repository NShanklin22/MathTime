import { test, expect } from '@playwright/test';
import { open, levelRow, setProblem, rect, typeKeys } from './helpers.js';

// The level selector (Level 2 spec §3).

// Load the game as it opens: on the selector.
async function home(page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
}

test('the game opens on the selector: the built levels by topic, nothing marked', async ({ page }) => {
  await home(page);
  await expect(page.locator('.select')).toBeVisible();
  for (const hidden of ['.stage', '.pad', '.lives']) await expect(page.locator(hidden)).toBeHidden();
  await expect(page.locator('.select .group-name')).toHaveText(['Addition', 'Subtraction']);
  await expect(page.locator('.select .group')).toHaveCount(2);
  await expect(page.locator('.select .group').nth(0).locator('.row')).toHaveAttribute('data-level', '1');
  await expect(page.locator('.select .group').nth(1).locator('.row')).toHaveAttribute('data-level', '2');
  await expect(page.getByRole('button', { name: 'Level 1: Single-digit addition' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Level 2: Subtraction within 10' })).toBeVisible();
  await expect(levelRow(page, 1).locator('.title')).toHaveText('Level 1');
  await expect(levelRow(page, 1).locator('.name')).toHaveText('Single-digit addition');
  await expect(levelRow(page, 1).locator('.sample')).toHaveText('3+4');
  await expect(levelRow(page, 2).locator('.sample')).toHaveText('7−3');
  await expect(levelRow(page, 1).locator('.sample')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.select .row.current')).toHaveCount(0);
});

test('on the selector the breadcrumb is "Levels" alone', async ({ page }) => {
  await home(page);
  await expect(page.locator('.crumbs .home')).toHaveText('Levels');
  await expect(page.locator('.crumbs .home')).toHaveAttribute('aria-current', 'page');
  for (const crumb of ['.back', '.topic', '.here', '.sep']) await expect(page.locator(`.crumbs ${crumb}`).first()).toBeHidden();
});

for (const n of [1, 2]) test(`choosing Level ${n} starts it at question 1 with 3 lives, focus on the answer`, async ({ page }) => {
  await home(page);
  await levelRow(page, n).click();
  await expect(page.locator('.select')).toBeHidden();
  await expect(page.locator('#qnum')).toHaveText('Question 1');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await expect(page.locator('#ans')).toBeFocused();
  await expect(page.locator('.crumbs .here')).toHaveText(`Level ${n}`);
  await expect(page.locator('.crumbs .home')).toBeHidden();
  await expect(page.locator('#status')).toHaveText(new RegExp(`^Question 1: \\d ${n === 1 ? 'plus' : 'minus'} \\d$`));
});

test('the rows are buttons in the tab order', async ({ page }) => {
  await home(page);
  await page.keyboard.press('Tab');
  await expect(levelRow(page, 1)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(levelRow(page, 2)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.crumbs .here')).toHaveText('Level 2');
});

test('running out of lives comes back with that level marked and focused, in white', async ({ page }) => {
  await open(page, 2);
  await setProblem(page, 7, 3);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 2)).toHaveClass(/\bcurrent\b/);
  await expect(levelRow(page, 1)).not.toHaveClass(/\bcurrent\b/);
  await expect(levelRow(page, 2)).toBeFocused();
  // White, 2px, 4px out: amber means "current".
  await expect(levelRow(page, 2)).toHaveCSS('outline-color', 'rgb(238, 245, 255)');
  await expect(levelRow(page, 2)).toHaveCSS('outline-width', '2px');
  await expect(levelRow(page, 2)).toHaveCSS('outline-offset', '4px');
  await levelRow(page, 1).click();
  await expect(page.locator('.crumbs .here')).toHaveText('Level 1');
  await expect(page.locator('#qnum')).toHaveText('Question 1');
});

test('the level you came from has a 4px amber bar on its left edge', async ({ page }) => {
  await home(page);
  await page.evaluate(() => document.querySelector('.select .row[data-level="1"]').classList.add('current'));
  const bar = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.select .row[data-level="1"]'), '::before');
    return { width: cs.width, color: cs.backgroundColor, left: cs.left, top: cs.top, bottom: cs.bottom };
  });
  expect(bar).toEqual({ width: '4px', color: 'rgb(255, 214, 107)', left: '0px', top: '0px', bottom: '0px' });
});

test('rows are 80px tall with the key ring and 24px padding; pressed, they take the key-press fill', async ({ page }) => {
  await home(page);
  const row = levelRow(page, 1);
  await expect(row).toHaveCSS('height', '80px');
  await expect(row).toHaveCSS('padding-left', '24px');
  await expect(row).toHaveCSS('padding-right', '24px');
  await expect(row).toHaveCSS('box-shadow', 'rgba(238, 245, 255, 0.8) 0px 0px 0px 1.5px inset');
  const box = await row.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await expect(row).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.12)');
  await page.mouse.up();
});

test('the type is set as the spec says', async ({ page }) => {
  await home(page);
  const heading = page.locator('.select .group-name').first();
  await expect(heading).toHaveCSS('font-size', '12px');
  await expect(heading).toHaveCSS('font-weight', '500');
  await expect(heading).toHaveCSS('letter-spacing', '1.2px');
  await expect(heading).toHaveCSS('text-transform', 'uppercase');
  await expect(heading).toHaveCSS('color', 'rgb(182, 205, 238)');
  const row = levelRow(page, 1);
  await expect(row.locator('.title')).toHaveCSS('font-size', '17px');
  await expect(row.locator('.title')).toHaveCSS('font-weight', '600');
  await expect(row.locator('.name')).toHaveCSS('font-size', '13px');
  await expect(row.locator('.name')).toHaveCSS('color', 'rgb(182, 205, 238)');
  await expect(row.locator('.sample')).toHaveCSS('font-size', '30px');
  await expect(row.locator('.sample')).toHaveCSS('font-weight', '500');
  await expect(row.locator('.sample .op')).toHaveCSS('color', 'rgb(182, 205, 238)');
});

// The text boxes are trimmed to the capitals and the baseline, so these
// layout distances are ink distances too (pixels: Task 5's tests).
test('the list starts 40px below the header, headings 14px above their rows, topics 32px apart', async ({ page }) => {
  await home(page);
  const road = await rect(page, '.road');
  const [h1, h2] = [await rect(page, '.select .group-name', 0), await rect(page, '.select .group-name', 1)];
  const [r1, r2] = [await rect(page, '.select .row', 0), await rect(page, '.select .row', 1)];
  expect(h1.top - road.bottom).toBeCloseTo(40, 1);
  expect(r1.top - h1.bottom).toBeCloseTo(14, 1);
  expect(h2.top - r1.bottom).toBeCloseTo(32, 1);
  expect(r2.top - h2.bottom).toBeCloseTo(14, 1);
});

test('the column is as wide as the keypad, centred', async ({ page }) => {
  await home(page);
  const width = await page.evaluate(() => innerWidth);
  const column = await rect(page, '.select');
  expect(column.width).toBe(Math.min(420, width));
  expect(Math.abs(column.left + column.width / 2 - width / 2)).toBeLessThanOrEqual(0.5);
  const row = await rect(page, '.select .row', 0);
  expect(row.left - column.left).toBe(16);
  expect(column.right - row.right).toBe(16);
});
