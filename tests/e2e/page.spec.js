import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

test('the page loads in IBM Plex Mono with the Blueprint background', async ({ page }) => {
  await open(page);
  const info = await page.evaluate(() => ({
    plex: document.fonts.check('500 64px "IBM Plex Mono"'),
    family: getComputedStyle(document.querySelector('#eq')).fontFamily,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  expect(info.plex).toBe(true);
  expect(info.family.startsWith('"IBM Plex Mono"')).toBe(true);
  expect(info.bg).toBe('rgb(18, 64, 126)');
  await expect(page.locator('.crumbs .here')).toHaveText('Level 1');
  await expect(page.locator('.pad button')).toHaveCount(12);
});
