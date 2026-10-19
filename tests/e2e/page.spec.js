import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

test('the page loads in IBM Plex Mono with the Blueprint background', async ({ page }) => {
  await open(page);
  const info = await page.evaluate(() => ({
    // document.fonts.check() is true when no face matches, so it proves nothing.
    // Instead require every weight of the real face to have actually loaded.
    plex: [400, 500, 600].every(w => [...document.fonts].some(
      f => f.family.replace(/"/g, '') === 'IBM Plex Mono' && f.weight === String(w) && f.status === 'loaded')),
    family: getComputedStyle(document.querySelector('#eq')).fontFamily,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  expect(info.plex).toBe(true);
  expect(info.family.startsWith('"IBM Plex Mono"')).toBe(true);
  expect(info.bg).toBe('rgb(18, 64, 126)');
  await expect(page.locator('.crumbs .here')).toHaveText('Level 1');
  await expect(page.locator('.pad button')).toHaveCount(12);
  await expect(page.getByRole('img', { name: '3 lives left' })).toBeVisible();
});
