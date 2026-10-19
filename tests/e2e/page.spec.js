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

test('startup measures the screen once', async ({ page }) => {
  // Each ink scan reads the canvas once. Count the scans in the first layout
  // and after the page settles: the fonts it waited for must not trigger a
  // second, cold measure when their load event arrives.
  await page.addInitScript(() => {
    window.scans = 0;
    const read = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      window.scans++;
      return read.apply(this, args);
    };
    new MutationObserver((_, observer) => {
      const html = document.documentElement;
      if (html && !html.classList.contains('loading')) {
        window.scansAtFirstLayout = window.scans;
        observer.disconnect();
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await open(page);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await page.waitForTimeout(500);
  const scans = await page.evaluate(() => ({ first: window.scansAtFirstLayout, total: window.scans }));
  expect(scans.first).toBeGreaterThan(0);
  expect(scans.total).toBe(scans.first);
});

test('a failed measurement still shows the page and the real problem', async ({ page }) => {
  // Every canvas read comes back blank, so the scanner finds no ink. A fixed
  // random makes the problem 2 + 2, unlike the 7 + 5 in index.html.
  await page.addInitScript(() => {
    CanvasRenderingContext2D.prototype.getImageData = (sx, sy, sw, sh) => new ImageData(sw, sh);
    Math.random = () => 0.25;
  });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'), null, { timeout: 10_000 });
  await expect(page.locator('.pad')).toBeVisible();
  await expect(page.locator('#ans')).toBeFocused();
  expect(errors.join('\n')).toContain('No ink');
  const shown = await page.evaluate(() => ({
    problem: window.mathtime.game.state.problem,
    a: document.querySelector('#a').textContent,
    b: document.querySelector('#b').textContent,
  }));
  expect(shown.a).toBe(String(shown.problem.a));
  expect(shown.b).toBe(String(shown.problem.b));
  const answer = await page.evaluate(() => {
    window.mathtime.view.renderAnswer('7');
    return document.querySelector('#shown').textContent;
  });
  expect(answer).toBe('7');
});
