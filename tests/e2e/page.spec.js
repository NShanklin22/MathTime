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

test('the controls have accessible names', async ({ page }) => {
  await open(page);
  await expect(page.locator('.crumbs .here')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('img', { name: /Roadmap stage 1 of 7/ })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Keypad' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Keypad' }).getByRole('button')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeVisible();
  await expect(page.getByRole('status')).toBeAttached();
});

test('a slow font stylesheet cannot hold the page for more than about 3 seconds', async ({ page }) => {
  // Delay the Google Fonts CSS by 10s. The timeout in fontsReady() must win.
  await page.route('https://fonts.googleapis.com/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 10_000));
    await route.continue().catch(() => {});
  });
  const t0 = Date.now();
  // The injected stylesheet delays the load event, so don't wait for it.
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeGreaterThan(2800);
  expect(elapsed).toBeLessThan(5000);
  await expect(page.locator('.pad button')).toHaveCount(12);
});
