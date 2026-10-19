import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

test('the scanner keeps only the four most recent font sizes', async ({ page }) => {
  await open(page);
  const scans = await page.evaluate(async () => {
    const { createScanner } = await import('/src/scanner.js');
    let reads = 0;
    const read = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      reads++;
      return read.apply(this, args);
    };
    try {
      const scan = createScanner();
      const style = { weight: '500', family: '"IBM Plex Mono"' };
      const count = size => { const before = reads; scan('8', style, size); return reads - before; };
      for (const size of [20, 21, 22, 23]) count(size);
      const recent = count(20);           // cached; 20 becomes the most recent
      count(24);                          // a fifth size drops the oldest, 21
      return { recent, kept: count(20), dropped: count(21) };
    } finally {
      CanvasRenderingContext2D.prototype.getImageData = read;
    }
  });
  expect(scans).toEqual({ recent: 0, kept: 0, dropped: 1 });
});
