import { test, expect } from '@playwright/test';
import { levelRow, finishRun, finishColumnRun, settle, capture, rect } from './helpers.js';
import { LEVELS } from '../../src/levels.js';

// Every screen fits its window (incident 2026-11-05, corrective action B.3):
// the level selector, each level's play screen and the finish screen, at
// the laptop windows and our two desktop ones, each in a context of its own
// at that pixel ratio. Nothing scrolls, neither the page nor anything on
// it, and nothing is clipped that isn't meant to be. Where a screen can
// still scroll (a short window, a phone), its scrollbar is the theme's,
// never the system's.
//
// The desktop project's browser shows real scrollbars (playwright.config.js),
// which take room as a desktop browser's do; the phone project skips this
// file (its browser hides them, and forces its own pixel ratio).

const SIZES = [[1366, 657, 1], [1536, 730, 1.25], [1280, 610, 1.5], [1440, 900, 1], [1920, 950, 1]];

// Windows where the selector's rows fit and only its padding would not, as
// it did before the padding gave way (the UI review): it must not scroll.
const PADDING_ONLY = [[1366, 400, 1], [1240, 610, 1], [1024, 620, 1], [1274, 636, 1], [800, 890, 1], [600, 905, 1]];

// Runs kept before the page loads, as the finish screen keeps them.
const earlier = (level, totalMs) => ({
  id: `earlier-${level}-${totalMs}`, level, finishedAt: '2026-11-01T09:30:00.000Z', totalMs, misses: 0, problems: [],
});
const ALL_FINISHED = LEVELS.map(level => earlier(level.n, 72_400 + 11_100 * level.n));

// A page of its own at `width`×`height`@`dpr`, opened on the selector, with
// `runs` kept. Real scrollbars, or this proves nothing: they must take room.
async function at(browser, baseURL, [width, height, dpr], runs = null) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, baseURL });
  const page = await context.newPage();
  if (runs) await page.addInitScript(r => localStorage.setItem('mathtime.runs', JSON.stringify(r)), runs);
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
  await settle(page);
  const bar = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;width:100px;height:100px;overflow:scroll';
    document.body.append(probe);
    const width = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return width;
  });
  expect(bar, 'real scrollbars, which take room').toBeGreaterThan(0);
  expect(await page.evaluate(() => `${innerWidth}×${innerHeight}@${devicePixelRatio}`)).toBe(`${width}×${height}@${dpr}`);
  return { context, page };
}

// What clips by design, and so may hold more than it shows:
// - the problem area (.stage): it clips the equation and the board as they
//   slide in and out (translateX(±40vw));
// - the live region (.sr-only, #status): visually hidden, in a 1px box, so
//   screen readers hear it and nothing shows.
const CLIPS_BY_DESIGN = ['.stage', '.sr-only'];

// Everything that scrolls or is clipped: each element that can scroll
// (overflow auto or scroll) and has more in it than its room, either way;
// each shown element that clips (overflow hidden or clip) more than a pixel
// of its content, but those that clip by design; and the document itself.
const overflowing = page => page.evaluate(byDesign => {
  const name = el => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + [...el.classList].map(c => `.${c}`).join('');
  const can = v => v === 'auto' || v === 'scroll';
  const clips = v => v === 'hidden' || v === 'clip';
  const found = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (can(cs.overflowY) && el.scrollHeight > el.clientHeight) found.push(`${name(el)} scrolls: ${el.scrollHeight}px tall in ${el.clientHeight}px`);
    if (can(cs.overflowX) && el.scrollWidth > el.clientWidth) found.push(`${name(el)} scrolls: ${el.scrollWidth}px wide in ${el.clientWidth}px`);
    if (byDesign.some(sel => el.matches(sel)) || !el.getClientRects().length || cs.visibility === 'hidden') continue;
    if (clips(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) found.push(`${name(el)} clips: ${el.scrollHeight}px tall in ${el.clientHeight}px`);
    if (clips(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) found.push(`${name(el)} clips: ${el.scrollWidth}px wide in ${el.clientWidth}px`);
  }
  const doc = document.scrollingElement;
  if (doc.scrollHeight > doc.clientHeight) found.push(`the document: ${doc.scrollHeight}px tall in ${doc.clientHeight}px`);
  if (doc.scrollWidth > doc.clientWidth) found.push(`the document: ${doc.scrollWidth}px wide in ${doc.clientWidth}px`);
  return found;
}, CLIPS_BY_DESIGN);

const nothingOverflows = async (page, where) => {
  await settle(page);
  expect(await overflowing(page), `${where}: nothing scrolls or is clipped`).toEqual([]);
};

for (const size of SIZES) test.describe(`${size[0]}×${size[1]}@${size[2]}`, () => {
  test('the level selector fits, fresh and with every level finished', async ({ browser, baseURL }) => {
    for (const runs of [null, ALL_FINISHED]) {
      const { context, page } = await at(browser, baseURL, size, runs);
      try {
        await expect(page.locator('.select .row.finished')).toHaveCount(runs ? LEVELS.length : 0);
        await nothingOverflows(page, runs ? 'every level finished' : 'fresh');
      } finally {
        await context.close();
      }
    }
  });

  test('each level\'s play screen fits, and the selector it comes back to', async ({ browser, baseURL }) => {
    const { context, page } = await at(browser, baseURL, size);
    try {
      for (const level of LEVELS) {
        await levelRow(page, level.n).click();
        await page.waitForFunction(() => !document.body.classList.contains('at-select'));
        await expect(page.locator('.crumbs .here')).toHaveText(`Level ${level.n}`);
        await nothingOverflows(page, `Level ${level.n}`);
        await page.keyboard.press('Escape');
        await expect(page.locator('.select')).toBeVisible();
        await nothingOverflows(page, `the selector, back from Level ${level.n}`);
      }
    } finally {
      await context.close();
    }
  });

  test('the finish screen fits, after a fact level and a column level', async ({ browser, baseURL }) => {
    const { context, page } = await at(browser, baseURL, size);
    try {
      for (const [n, finish] of [[1, finishRun], [6, finishColumnRun]]) {
        await levelRow(page, n).click();
        await page.waitForFunction(() => !document.body.classList.contains('at-select'));
        await finish(page);
        await expect(page.locator('.finish .done-title')).toHaveText(`Level ${n} complete`);
        await nothingOverflows(page, `the finish screen, Level ${n}`);
        // By the keyboard: a tap would hold off the next row's tap for its double tap.
        await page.locator('.finish .levels').press('Enter');
        await expect(page.locator('.select')).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });
});

for (const size of PADDING_ONLY) test(`at ${size[0]}×${size[1]}@${size[2]} the selector's rows fit, so it doesn't scroll for its padding`, async ({ browser, baseURL }) => {
  for (const runs of [null, ALL_FINISHED]) {
    const { context, page } = await at(browser, baseURL, size, runs);
    try {
      await nothingOverflows(page, runs ? 'every level finished' : 'fresh');
    } finally {
      await context.close();
    }
  }
});

// ---------- The scrollbar (the UI review) ----------

// Where a list still scrolls, its scrollbar is the theme's, read from its
// pixels: 8px wide, the track clear (so it shows what is behind it, the
// blueprint grid) with no buttons, and the thumb, square, in --faint;
// --muted under the pointer and --ink while held, so it gets stronger,
// never weaker, when grabbed. Every pixel of the strip is the page behind
// it or the thumb's colour over it, so nothing in it is a system grey.
const FAINT = [111, 149, 204], MUTED = [182, 205, 238], INK = [238, 245, 255];

// The scrollbar's strip, device pixels, from a capture.
const strip = ({ png, dpr }, box, bar) => {
  const x0 = Math.round((box.right - bar) * dpr), x1 = Math.round(box.right * dpr);
  const y0 = Math.ceil(box.top * dpr), y1 = Math.floor(box.bottom * dpr);
  const px = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * png.width + x) * 4;
    px.push({ x, y, rgb: [png.data[i], png.data[i + 1], png.data[i + 2]] });
  }
  return px;
};

// With a style added for one capture only.
async function captureWith(page, css) {
  const tag = await page.addStyleTag({ content: css });
  await settle(page);
  const shot = await capture(page);
  await tag.evaluate(t => t.remove());
  await settle(page);
  return shot;
}

// The thumb as drawn in `shot` against `behind` (the same strip with no
// scrollbar at all, so the page behind it): each pixel that differs must be
// `colour` laid over what is behind it, wholly or (at an edge) in part, the
// same part in every channel. So the track is clear, and nothing in the
// strip is any other colour. Returns the thumb's box in CSS px.
function thumb(shot, behind, colour, what) {
  const track = behind;
  const [a, b] = [strip(...shot), strip(...track)];
  let whole = 0, box = null;
  const wrong = [];
  a.forEach((p, i) => {
    const under = b[i].rgb;
    if (p.rgb.every((c, k) => c === under[k])) return;
    const parts = [0, 1, 2].filter(k => Math.abs(colour[k] - under[k]) > 8).map(k => (p.rgb[k] - under[k]) / (colour[k] - under[k]));
    const ok = parts.length && parts.every(t => t > -0.05 && t < 1.05) && Math.max(...parts) - Math.min(...parts) < 0.15;
    if (!ok) wrong.push({ x: p.x, y: p.y, rgb: p.rgb, under });
    if (p.rgb.every((c, k) => Math.abs(c - colour[k]) <= 3)) whole++;
    const dpr = shot[0].dpr;
    box = box ? { left: Math.min(box.left, p.x / dpr), right: Math.max(box.right, (p.x + 1) / dpr), top: Math.min(box.top, p.y / dpr), bottom: Math.max(box.bottom, (p.y + 1) / dpr) }
      : { left: p.x / dpr, right: (p.x + 1) / dpr, top: p.y / dpr, bottom: (p.y + 1) / dpr };
  });
  expect(wrong.length, `${what}: pixels that aren't the thumb's colour over the track (first ${JSON.stringify(wrong[0])})`).toBe(0);
  expect(whole, `${what}: the thumb is drawn in its colour`).toBeGreaterThan(0);
  return box;
}

async function themedScrollbar(page, selector) {
  const list = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    return {
      scrolls: el.scrollHeight > el.clientHeight, bar: el.offsetWidth - el.clientWidth - el.clientLeft * 2,
      marked: document.documentElement.classList.contains('scrollbars-take-room'),
    };
  }, selector);
  expect(list.marked, 'the page knows the system\'s scrollbars take room').toBe(true);
  expect(list.scrolls, `${selector} scrolls here`).toBe(true);
  expect(list.bar, 'the scrollbar is 8px wide').toBe(8);
  const box = await rect(page, selector);
  const region = [box, list.bar];
  const dpr = await page.evaluate(() => devicePixelRatio);
  const scrollTo = where => page.evaluate(([sel, where]) => {
    const el = document.querySelector(sel);
    el.scrollTop = where === 'end' ? el.scrollHeight : 0;
  }, [selector, where]);
  // The page behind the scrollbar: the list with none.
  const behind = () => captureWith(page, `${selector} { scrollbar-width: none !important; }`);
  await page.mouse.move(1, 1);
  await scrollTo('top');                   // the finish screen opens scrolled to "Again"
  await settle(page);
  // Idle: --faint, square, as wide as the scrollbar. No buttons: at the top
  // the thumb starts where the strip does, and at the end it ends there.
  const shot = await capture(page);
  const idle = thumb([shot, ...region], [await behind(), ...region], FAINT, 'idle');
  expect(idle.right - idle.left, 'the thumb fills the scrollbar\'s width').toBeCloseTo(8, 1);
  expect(Math.abs(idle.top - box.top), 'no button above the thumb').toBeLessThanOrEqual(1 / dpr + 0.01);
  await scrollTo('end');
  await settle(page);
  const end = thumb([await capture(page), ...region], [await behind(), ...region], FAINT, 'idle, at the end');
  expect(Math.abs(box.bottom - end.bottom), 'no button below it').toBeLessThanOrEqual(1 / dpr + 0.01);
  await scrollTo('top');
  await settle(page);
  // Under the pointer: --muted. Held: --ink.
  const back = await behind();
  await page.mouse.move((idle.left + idle.right) / 2, (idle.top + idle.bottom) / 2);
  await settle(page);
  thumb([await capture(page), ...region], [back, ...region], MUTED, 'hovered');
  await page.mouse.down();
  await settle(page);
  thumb([await capture(page), ...region], [back, ...region], INK, 'held');
  await page.mouse.up();
  await page.mouse.move(1, 1);
}

for (const size of [[1366, 320, 1], [375, 812, 2]]) test(`at ${size[0]}×${size[1]}@${size[2]} the selector still scrolls, with the theme's scrollbar`, async ({ browser, baseURL }) => {
  const { context, page } = await at(browser, baseURL, size);
  try {
    await themedScrollbar(page, '.select');
  } finally {
    await context.close();
  }
});

// The theme's scrollbar goes wherever the system's own takes room (the UI
// re-review), measured at the start, not guessed from the pointer: a touch
// screen on Windows (a Surface as a tablet) has no mouse, but keeps the
// classic 15px grey bar. Touch emulation alone is that: a coarse pointer,
// no hover, and classic scrollbars.
test('a touch screen whose system scrollbar takes room (no mouse) gets the theme\'s scrollbar', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 320 }, deviceScaleFactor: 1, hasTouch: true, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
    await settle(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse) and (hover: none)').matches), 'a coarse pointer, no hover').toBe(true);
    await themedScrollbar(page, '.select');
  } finally {
    await context.close();
  }
});

// Phones and tablets keep their own scrollbars, overlaid, taking no room.
// Chromium's mobile emulation draws overlay scrollbars, but would give a
// ::-webkit-scrollbar one its 8px, as Android's Chrome would. So there the
// page leaves the system's alone, and the rows keep the list's whole width
// less its padding.
test('on a phone (mobile emulation, touch) the list scrolls with its own overlay scrollbar, the rows at their full width', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
    await settle(page);
    const found = await page.evaluate(() => {
      const list = document.querySelector('.select');
      const row = list.querySelector('.row').getBoundingClientRect();
      return {
        mouse: matchMedia('(hover: hover) and (pointer: fine)').matches,
        marked: document.documentElement.classList.contains('scrollbars-take-room'),
        scrolls: list.scrollHeight > list.clientHeight,
        bar: list.offsetWidth - list.clientWidth,
        list: list.getBoundingClientRect().width, row: row.width,
      };
    });
    expect(found.mouse, 'a touch screen, not a mouse').toBe(false);
    expect(found.marked, 'the system\'s scrollbars take no room here').toBe(false);
    expect(found.scrolls, 'the list scrolls here').toBe(true);
    expect(found.bar, 'its scrollbar takes no room').toBe(0);
    expect(found.row, 'the rows at the list\'s width less its 16px padding').toBe(found.list - 32);
  } finally {
    await context.close();
  }
});

// The finish screen's column scrolls on a short screen too (reveal.js).
test('at 1366×300@1 the finish screen still scrolls, with the theme\'s scrollbar', async ({ browser, baseURL }) => {
  const { context, page } = await at(browser, baseURL, [1366, 300, 1]);
  try {
    await levelRow(page, 1).click();
    await page.waitForFunction(() => !document.body.classList.contains('at-select'));
    await finishRun(page);
    await settle(page);
    await themedScrollbar(page, '.finish');
  } finally {
    await context.close();
  }
});
