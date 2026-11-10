import { test, expect } from './fixtures.js';
import {
  open, levelRow, freeze, settle, resize, setProblem, playTo, rect, capture, ink, partlyCovered, note, fontSize, typeKeys, TOL, FAINT, GOOD,
} from './helpers.js';

// How far through the run you are (runs spec §2): "Question N of 20", and a
// bar of 20 segments, one filled on each correct answer.

const filled = page => page.locator('.run span.done').count();
const segments = page => page.evaluate(() => [...document.querySelectorAll('.run span')].map(s => {
  const r = s.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
}));

test.beforeEach(async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
});

test('the label says "Question N of 20", and screen readers hear it with the problem', async ({ page }) => {
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  await expect(page.locator('#status')).toHaveText(/^Question 1 of 20: \d plus \d$/);
  await playTo(page, 4);
  await expect(page.locator('#qnum')).toHaveText('Question 4 of 20');
  const { a, b } = await page.evaluate(() => window.mathtime.game.state.problem);
  await expect(page.locator('#status')).toHaveText(`Question 4 of 20: ${a} plus ${b}`);
});

test('the bar has 20 segments, hidden from screen readers, none filled at the start', async ({ page }) => {
  await expect(page.locator('.run span')).toHaveCount(20);
  await expect(page.locator('.run')).toHaveAttribute('aria-hidden', 'true');
  expect(await filled(page)).toBe(0);
});

test('a correct answer fills one segment at once, with the green', async ({ page }) => {
  await page.evaluate(() => {
    const eq = document.querySelector('#eq');
    const watch = new MutationObserver(() => {
      if (!eq.classList.contains('correct')) return;
      watch.disconnect();
      window.filledAtGreen = document.querySelectorAll('.run span.done').length;
    });
    watch.observe(eq, { attributes: true, attributeFilter: ['class'] });
  });
  await typeKeys(page, ['7', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
  expect(await page.evaluate(() => window.filledAtGreen)).toBe(1);
  expect(await filled(page)).toBe(1);
  await expect(page.locator('.run span').first()).toHaveClass(/\bdone\b/);
});

test('a wrong answer fills nothing', async ({ page }) => {
  await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  expect(await filled(page)).toBe(0);
});

test('empty segments are faint and filled ones green', async ({ page }) => {
  await playTo(page, 4);
  expect(await filled(page)).toBe(3);
  await expect(page.locator('.run span').nth(2)).toHaveCSS('background-color', 'rgb(143, 240, 192)');
  await expect(page.locator('.run span').nth(3)).toHaveCSS('background-color', 'rgb(111, 149, 204)');
});

test('a new run starts with an empty bar', async ({ page }) => {
  await playTo(page, 8);
  expect(await filled(page)).toBe(7);
  await setProblem(page, 3, 4);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await levelRow(page, 1).click();
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  expect(await filled(page)).toBe(0);
});

test('only the filling segment changes: the bar keeps its place, and the equation its size', async ({ page }) => {
  const before = { bar: await segments(page), font: await fontSize(page) };
  await typeKeys(page, ['7', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
  await expect(page.locator('#eq')).not.toHaveClass(/\bin\b/);   // it has slid in
  expect(await segments(page)).toEqual(before.bar);
  expect(await fontSize(page)).toBe(before.font);
});

test('the bar is hidden on the level selector', async ({ page }) => {
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('.select')).toBeVisible();
  await expect(page.locator('.run')).toBeHidden();
});

test.describe('alignment', () => {
  test.beforeEach(async ({ page }) => {
    await freeze(page);
  });

  // The bar's painted ink: every segment, empty ones in --faint. Across the
  // bar's box, and down its segments' row with 2px to spare (the box's
  // bottom padding ends at the keypad, whose key rings would count).
  async function barInk(page) {
    const r = await rect(page, '.run');
    const seg = await rect(page, '.run span');
    return ink(await capture(page), { left: r.left, right: r.right, top: seg.top - 2, bottom: seg.bottom + 2 }, FAINT);
  }

  test('the bar is centred over the keypad, 16px above its keys, 318px wide', async ({ page }) => {
    const bar = await barInk(page);
    const middle = await rect(page, '.pad button[data-k="2"]');
    const off = bar.midX - (middle.left + middle.right) / 2;
    note('bar centre offset', off);
    expect(Math.abs(off)).toBeLessThanOrEqual(TOL);
    note('bar → keys', middle.top - bar.bottom);
    expect(Math.abs(middle.top - bar.bottom - 16)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(bar.right - bar.left - 318)).toBeLessThanOrEqual(TOL);
  });

  test('every segment is 14px by 6px, 2px apart, on whole device pixels', async ({ page }) => {
    const dpr = await page.evaluate(() => devicePixelRatio);
    const segs = await segments(page);
    expect(segs).toHaveLength(20);
    segs.forEach((s, i) => {
      expect([s.width, s.height], `segment ${i}`).toEqual([14, 6]);
      for (const edge of [s.left, s.top]) {
        expect(Math.abs(edge * dpr - Math.round(edge * dpr)), `segment ${i}`).toBeLessThan(0.02);
      }
      if (i) expect(Math.abs(s.left - segs[i - 1].right - 2), `gap before segment ${i}`).toBeLessThan(0.01);
    });
  });

  // Where the bar has less room than its 318px (inside its 16px gutters),
  // its segments are 12px wide, and under 278px 10px: still whole pixels,
  // 2px apart, and inside the gutters. Sideways on the smallest phone, and
  // upright at 320 and 280 wide.
  for (const [width, height, seg] of [[568, 320, 12], [320, 640, 12], [280, 700, 10]]) test(`at ${width}×${height} the segments are ${seg}px wide, on whole device pixels, inside the gutters`, async ({ page }) => {
    await resize(page, width, height);
    const dpr = await page.evaluate(() => devicePixelRatio);
    const segs = await segments(page);
    const run = await rect(page, '.run');
    segs.forEach((s, i) => {
      expect([s.width, s.height], `segment ${i}`).toEqual([seg, 6]);
      expect(Math.abs(s.left * dpr - Math.round(s.left * dpr)), `segment ${i}`).toBeLessThan(0.02);
      if (i) expect(Math.abs(s.left - segs[i - 1].right - 2), `gap before segment ${i}`).toBeLessThan(0.01);
    });
    note('left gutter', segs[0].left - run.left);
    note('right gutter', run.right - segs[19].right);
    // (The snap moves the segments by up to half a device pixel.)
    expect(segs[0].left - run.left, 'left gutter').toBeGreaterThanOrEqual(16 - 0.5 / dpr);
    expect(run.right - segs[19].right, 'right gutter').toBeGreaterThanOrEqual(16 - 0.5 / dpr);
  });

  // Where the page paints the segments, which their rects alone can't show:
  // on whole device pixels, every pixel of a segment is wholly its colour
  // and every pixel round it wholly background. The page paints a plain box
  // on whole device pixels by itself, so a skipped snap still paints sharp;
  // the rect check above catches that. This guards against the other ways
  // to place the bar: a transform, which the page adds after rounding and
  // which leaves rows or columns of partly covered pixels, and moving the
  // bar's own box, which scrolls the window sideways. At each project's own
  // size, where the keypad's height puts the bar a fraction of a device
  // pixel down on the phone; at 1439 wide, where centring puts it half a
  // pixel across at 1x; and sideways at 667×375, where the keypad's width
  // puts it a fraction across at either ratio.
  for (const size of [null, [1439, 900], [667, 375]]) test(`no segment's edge pixels are partly covered${size ? ` at ${size.join('×')}` : ''}`, async ({ page }) => {
    if (size) await resize(page, ...size);
    await playTo(page, 8);                 // filled and empty segments both
    const shot = await capture(page);
    const segs = await page.evaluate(() => [...document.querySelectorAll('.run span')].map(s => {
      const r = s.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, done: s.classList.contains('done') };
    }));
    expect(segs.filter(s => s.done)).toHaveLength(7);
    // Each segment with a CSS px round it: half the gap to the next.
    const partly = segs.map(s => partlyCovered(shot, { left: s.left - 1, right: s.right + 1, top: s.top - 1, bottom: s.bottom + 1 }, s.done ? GOOD : FAINT));
    note('partly covered pixels', partly.reduce((sum, n) => sum + n, 0), '');
    partly.forEach((n, i) => expect(n, `segment ${i}: partly covered pixels`).toBe(0));
    // The segments are moved, not the bar's box: it is as wide as the
    // window, and moving it would push its edge past the window's.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'horizontal scroll').toBeLessThanOrEqual(0);
  });

  test('the bar takes nothing from the equation: it is as large as without the bar', async ({ page }) => {
    await expect(page.locator('.run span')).toHaveCount(20);
    const withBar = await fontSize(page);
    await page.addStyleTag({ content: '.run { display: none !important; }' });
    await settle(page);
    note('font size', withBar);
    expect(await fontSize(page)).toBe(withBar);
  });

  test('held sideways, the bar is centred under the problem area, 16px above the bottom', async ({ page }) => {
    await resize(page, 844, 390);
    const bar = await barInk(page);
    const stage = await rect(page, '.stage');
    const off = bar.midX - (stage.left + stage.right) / 2;
    note('bar centre offset', off);
    expect(Math.abs(off)).toBeLessThanOrEqual(TOL);
    expect(bar.top, 'below the problem area').toBeGreaterThanOrEqual(stage.bottom - TOL);
    note('bar → bottom', 390 - bar.bottom);
    expect(Math.abs(390 - bar.bottom - 16)).toBeLessThanOrEqual(TOL);
  });
});
