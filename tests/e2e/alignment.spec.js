import { test, expect } from '@playwright/test';
import { chromium } from 'playwright-core';
import {
  open, freeze, showOutline, resize, setProblem, rect, capture, ink, digitInk, digitBand, boxEdges, outlineEdges,
  boxInside, borderInner, showAnswer, fontSize, cssFontSize, TOL,
} from './helpers.js';

// Space between the stage edges and what you see of the equation, from
// pixels: the first digit's ink on the left, the box's dashed outline on the
// right. The equation is centred on that, not on its layout box (spec §3.2).
async function gutters(page) {
  await showOutline(page);
  const shot = await capture(page);
  const first = await digitInk(page, shot, '#a');
  const outline = await outlineEdges(page, shot);
  const s = await rect(page, '.stage');
  const { scroll, phone } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth - innerWidth, phone: innerWidth <= 480 }));
  return { left: first.left - s.left, right: s.right - outline.right, scroll, phone };
}


test.beforeEach(async ({ page }) => {
  await open(page);
  await freeze(page);
});

test('box and operators are centred on the digit ink', async ({ page }) => {
  const digits = await digitBand(page);
  const shot = await capture(page);
  const box = await boxEdges(page, shot);
  expect(Math.abs(box.midY - digits.mid)).toBeLessThanOrEqual(TOL);
  for (const i of [0, 1]) {
    const op = ink(shot, await rect(page, '#eq .op', i), [182, 205, 238]);   // muted #b6cdee
    // Recorded so drift shows in reports: "=" sits at the 0.5px floor at 1x.
    test.info().annotations.push({ type: `"${['+', '='][i]}" offset`, description: `${(op.midY - digits.mid).toFixed(4)}px` });
    expect(Math.abs(op.midY - digits.mid)).toBeLessThanOrEqual(TOL);
  }
});

test('the caret reaches the digit ink at both ends, never short', async ({ page }) => {
  const digits = await digitBand(page);
  const caret = await rect(page, '.caret');
  const dpr = await page.evaluate(() => devicePixelRatio);
  expect(caret.top).toBeLessThanOrEqual(digits.top + 0.01);
  expect(caret.top).toBeGreaterThan(digits.top - 1 / dpr - 0.01);
  expect(caret.bottom).toBeGreaterThanOrEqual(digits.bottom - 0.01);
  expect(caret.bottom).toBeLessThan(digits.bottom + 1 / dpr + 0.01);
});

test('every possible answer is ink-centred in the box, and wide wrong entries fit', async ({ page }) => {
  const { inner, centre } = await boxInside(page);
  let widest = 0;
  for (let n = 0; n <= 18; n++) {
    await showAnswer(page, String(n));
    const answer = ink(await capture(page), inner);
    expect(Math.abs(answer.midX - centre), `answer ${n}`).toBeLessThanOrEqual(TOL);
    widest = Math.max(widest, answer.right - answer.left);
  }
  // In IBM Plex Mono "44" is wider than every real answer, so it must be
  // scaled down to fit. "88" is not wider; it only checks that it fits.
  for (const wide of ['44', '88']) {
    await showAnswer(page, wide);
    const answer = ink(await capture(page), inner);
    expect(answer.right - answer.left, `${wide} width`).toBeLessThanOrEqual(widest + TOL);
    expect(Math.abs(answer.midX - centre), `${wide} centre`).toBeLessThanOrEqual(TOL);
  }
});

test('an answer sits on the same baseline as the problem', async ({ page }) => {
  await setProblem(page, 8, 8);
  await showAnswer(page, '8');
  const { inner } = await boxInside(page);
  const shot = await capture(page);
  const r = await rect(page, '#a');
  const problem = ink(shot, { ...r, top: r.top - 4, bottom: r.bottom + 4 });
  const answer = ink(shot, inner);
  // The spec target is 0px. ink() measures to about 0.01px, so 0.05 still
  // catches a single device pixel (0.5px at 2x), which TOL would let through.
  const EXACT = 0.05;
  expect(Math.abs(answer.bottom - problem.bottom), 'ink bottom').toBeLessThanOrEqual(EXACT);
  expect(Math.abs(answer.top - problem.top), 'ink top').toBeLessThanOrEqual(EXACT);
});

// The box wraps every possible answer in equal padding: across, the widest
// answer's ink; up and down, the digit ink band (all ten digits). The widest
// answer ("14" in Plex Mono) has flat tops and feet, so its own ink sits
// inside the band by the round digits' overshoot (about 0.016em).
test('the widest answer has the same padding on all four sides', async ({ page }) => {
  const pad = 0.17 * await fontSize(page);
  const digits = await digitBand(page);
  const { bw, outer, inner } = await boxInside(page);
  let widest = null;
  for (let n = 0; n <= 18; n++) {
    await showAnswer(page, String(n));
    const shot = await capture(page);
    const answer = ink(shot, inner);
    if (!widest || answer.right - answer.left > widest.ink.right - widest.ink.left) widest = { n, ink: answer, shot };
  }
  const edge = borderInner(widest.shot, outer, bw);
  const gaps = {
    left: widest.ink.left - edge.left,
    right: edge.right - widest.ink.right,
    top: digits.top - edge.top,
    bottom: edge.bottom - digits.bottom,
  };
  // The four sides must match each other (spec: within about 0.5px)...
  const sides = Object.values(gaps);
  const spread = Math.max(...sides) - Math.min(...sides);
  // Recorded so drift shows in reports: desktop sits close to TOL.
  test.info().annotations.push({ type: 'padding spread', description: `${spread.toFixed(4)}px` });
  expect(spread, `answer ${widest.n}, padding spread`).toBeLessThanOrEqual(TOL);
  // ...and, loosely, the designed padding.
  for (const [side, gap] of Object.entries(gaps)) {
    expect(Math.abs(gap - pad), `answer ${widest.n}, ${side} padding`).toBeLessThanOrEqual(1);
  }
});

// The caret's real visibility. freeze() hides it for pixel measurement, so
// read it with that rule switched off.
const caretVisibility = page => page.evaluate(() => {
  const frozen = [...document.querySelectorAll('style')].filter(s => s.textContent.includes('.caret{visibility:hidden'));
  frozen.forEach(s => { s.disabled = true; });
  const visibility = getComputedStyle(document.querySelector('.caret')).visibility;
  frozen.forEach(s => { s.disabled = false; });
  return visibility;
});

test('the caret is centred in an empty box, a fixed gap after a digit, and hidden when full', async ({ page }) => {
  const fs = await fontSize(page);
  const { inner, centre } = await boxInside(page);
  await showAnswer(page, '');
  const empty = await rect(page, '.caret');
  expect(Math.abs(empty.left + empty.width / 2 - centre), 'empty box').toBeLessThanOrEqual(TOL);
  await showAnswer(page, '7');
  const seven = ink(await capture(page), inner);
  const caret = await rect(page, '.caret');
  expect(Math.abs(caret.left - seven.right - Math.max(0.08 * fs, 4)), 'gap after the ink').toBeLessThanOrEqual(TOL);
  // The caret only shows while the answer field has focus (.focused). With
  // that, it shows after one digit and a full box still hides it.
  await page.evaluate(() => document.querySelector('#slot').classList.add('focused'));
  expect(await caretVisibility(page)).toBe('visible');
  await showAnswer(page, '17');
  await expect(page.locator('#slot')).toHaveClass(/\bfull\b/);
  expect(await caretVisibility(page)).toBe('hidden');
});

// Switch freeze()'s hiding of the caret off (true) or back on (false).
const caretShown = (page, on) => page.evaluate(on => {
  for (const s of document.querySelectorAll('style')) if (s.textContent.includes('.caret{visibility:hidden')) s.disabled = on;
}, on);
const AMBER = [255, 214, 107];   // #ffd66b: the digits and the box score nothing against it

// The gap depends on where the answer falls on the device pixel grid, which
// moves with the box: at the start size for whatever problem is showing, and
// at sizes that once spread it over a device pixel for every first digit.
for (const size of [null, [740, 360], [932, 430], [561, 560]]) test(`the caret is drawn the same after every digit: one width, one gap to half a device pixel${size ? ` (${size.join('×')}, every first digit)` : ''}`, async ({ page }) => {
  if (size) await resize(page, ...size);
  await page.evaluate(() => document.querySelector('#slot').classList.add('focused'));
  const dpr = await page.evaluate(() => devicePixelRatio);
  const spread = list => Math.max(...list) - Math.min(...list);
  for (const first of size ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [null]) {
    if (first) await setProblem(page, first, 5);
    const { inner } = await boxInside(page);
    const gaps = [], widths = [];
    for (const d of '0123456789') {
      await showAnswer(page, d);
      const digit = ink(await capture(page), inner);                  // caret hidden
      await caretShown(page, true);
      const caret = ink(await capture(page), { ...inner, right: inner.right + 20 }, AMBER);
      await caretShown(page, false);
      gaps.push(caret.left - digit.right);
      widths.push(caret.right - caret.left);
      // Laid out on whole device pixels, so what layout and tests read is what is drawn.
      const box = await rect(page, '.caret');
      for (const [edge, v] of [['left', box.left], ['width', box.width]]) {
        expect(Math.abs(v * dpr - Math.round(v * dpr)), `digit ${d}: caret ${edge} on the grid`).toBeLessThanOrEqual(0.02);
      }
    }
    const problem = first ? `${first} + 5, ` : '';
    test.info().annotations.push({ type: `${problem}gaps`, description: gaps.map(g => g.toFixed(3)).join(' ') });
    expect(spread(widths), `${problem}painted width`).toBeLessThanOrEqual(0.05);
    // Each gap is within half a device pixel of the design, so at most one apart.
    expect(spread(gaps), `${problem}gap after the ink`).toBeLessThanOrEqual(1 / dpr + 0.05);
  }
});

test('keypad digit labels are centred on their ink', async ({ page }) => {
  const shot = await capture(page);
  for (const k of '0123456789') {
    const r = await rect(page, `.pad button[data-k="${k}"]`);
    const label = ink(shot, { left: r.left + 4, right: r.right - 4, top: r.top + 4, bottom: r.bottom - 4 });
    expect(Math.abs(label.midY - (r.top + r.height / 2)), `key ${k} vertical`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(label.midX - (r.left + r.width / 2)), `key ${k} horizontal`).toBeLessThanOrEqual(TOL);
  }
});

test('a layout while a key is pressed leaves that key\'s label alone', async ({ page }) => {
  // A pressed key is scaled to 0.97, so measuring it then would misplace its label.
  const label = page.locator('.pad button[data-k="5"] .kl');
  const before = await label.evaluate(el => el.style.transform);
  await page.evaluate(() => {
    const key = document.querySelector('.pad button[data-k="5"]');
    key.classList.add('pressed');
    key.getAnimations().forEach(a => a.finish());   // skip the press transition
    window.mathtime.layout.layout();
    key.classList.remove('pressed');
  });
  expect(await label.evaluate(el => el.style.transform)).toBe(before);
});

test('gutters hold, overhang included, with no horizontal scroll', async ({ page }) => {
  const g = await gutters(page);
  const min = g.phone ? 16 : 24;
  expect(g.left).toBeGreaterThanOrEqual(min - 0.01);
  expect(g.right).toBeGreaterThanOrEqual(min - 0.01);
  expect(g.scroll).toBeLessThanOrEqual(0);
});

test('a narrow screen shrinks the equation to fit, measured again', async ({ page }) => {
  // This drops the phone project to 1x, which is fine: everything below is
  // measured in that state.
  await page.setViewportSize({ width: 280, height: 700 });
  // Wait until the equation is smaller than its CSS size.
  await expect.poll(async () => await fontSize(page) < await cssFontSize(page)).toBe(true);
  const digits = await digitBand(page);
  const shot = await capture(page);
  const box = await boxEdges(page, shot);
  const plus = ink(shot, await rect(page, '#eq .op', 0), [182, 205, 238]);   // muted #b6cdee
  expect(Math.abs(box.midY - digits.mid), 'box').toBeLessThanOrEqual(TOL);
  expect(Math.abs(plus.midY - digits.mid), '+').toBeLessThanOrEqual(TOL);
  // Last: this shows the dashed outline, which the box measurement hides.
  const g = await gutters(page);
  expect(g.left).toBeGreaterThanOrEqual(16 - 0.01);
  expect(g.right).toBeGreaterThanOrEqual(16 - 0.01);
  expect(g.scroll).toBeLessThanOrEqual(0);
});

test('a repeat layout after a full shrink needs no new scans', async ({ page }) => {
  // At 280px wide and 2x the fitting loop tries the CSS size and smaller
  // ones, so with the keypad and "Question N" one layout uses up to seven
  // font sizes. All of them must stay cached. The ratio is emulated, because setViewportSize
  // would drop the phone project to 1x.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 280, height: 700, deviceScaleFactor: 2, mobile: false });
  await page.waitForFunction(() => innerWidth === 280 && devicePixelRatio === 2);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const reads = await page.evaluate(() => {
    let count = 0;
    const read = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      count++;
      return read.apply(this, args);
    };
    try {
      window.mathtime.layout.layout();
    } finally {
      CanvasRenderingContext2D.prototype.getImageData = read;
    }
    return count;
  });
  expect(reads).toBe(0);
});

// The shake and slide animations move #eq with a transform. Lay out while it
// is moved, then check where it lands once the transform is gone. Where it
// goes depends on the first digit, so try each.
async function laidOutOnGrid(page) {
  for (let a = 0; a <= 9; a++) {
    await page.evaluate(a => {
      const { game, layout } = window.mathtime;
      game.state.problem = { a, b: 1, answer: a + 1 };
      const eq = document.querySelector('#eq');
      eq.style.transform = 'translate(13.37px, 7.77px)';
      layout.layout();
      eq.style.transform = '';
    }, a);
    const off = await page.evaluate(() => {
      const { geo } = window.mathtime.layout;
      const r = document.querySelector('#eq').getBoundingClientRect();
      const fromGrid = v => Math.abs(v * devicePixelRatio - Math.round(v * devicePixelRatio));
      return { left: fromGrid(r.left), baseline: fromGrid(r.top + geo.base * geo.fs) };
    });
    expect(off.left, `a = ${a}: left edge, device px from the grid`).toBeLessThanOrEqual(0.01);
    expect(off.baseline, `a = ${a}: baseline, device px from the grid`).toBeLessThanOrEqual(0.01);
  }
}

test('a layout during an animation still puts the equation on whole device pixels', async ({ page }) => {
  await laidOutOnGrid(page);
});

test('the equation lands on whole device pixels at an odd width too', async ({ page }) => {
  // Where the equation's natural place has a finer fraction of a pixel, a
  // length written with too few digits is cut short (see onLayoutGrid).
  await resize(page, 381, 812);
  await laidOutOnGrid(page);
});

test('the equation lands on whole device pixels at ratios that are not powers of two', async ({ baseURL }) => {
  // In real windows at these ratios (a launch flag): emulating the ratio lays
  // out on a coarser grid, 1/64 CSS px, on which these device pixels don't
  // exist. The two projects share the ratios out.
  for (const dpr of test.info().project.name === 'phone' ? [3] : [2.625, 1.5]) {
    const browser = await chromium.launch({ args: [`--force-device-scale-factor=${dpr}`, '--window-size=400,860', '--disable-lcd-text'] });
    try {
      const page = await browser.newPage({ viewport: null, deviceScaleFactor: undefined });   // not the project's
      await page.goto(baseURL + '/');
      await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
      await page.locator('.select .row[data-level="1"]').click();
      expect(await page.evaluate(() => devicePixelRatio)).toBe(dpr);
      await laidOutOnGrid(page);
    } finally {
      await browser.close();
    }
  }
});

// Whether the breadcrumb fits on one line: its crumbs within its own box,
// which is the header's room plus the first crumb's left side bearing
// (fitHeader moves the box out by it, so the ink starts at the edge).
const crumbsFit = page => page.evaluate(() => {
  const crumbs = document.querySelector('.crumbs');
  return crumbs.scrollWidth <= crumbs.clientWidth;
});

test('the header stays on one line at 320px wide', async ({ page }) => {
  // Note: setViewportSize drops the phone project to 1x; this test measures no pixels.
  await page.setViewportSize({ width: 320, height: 640 });
  await expect.poll(() => crumbsFit(page)).toBe(true);
  await expect(page.locator('.crumbs .here')).toBeVisible();
});

test('a tight header drops the topic crumb; "Levels" and the level stay', async ({ page }) => {
  // Note: setViewportSize drops the phone project to 1x; this test measures no pixels.
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const crumb of ['.back', '.topic', '.topic-sep', '.here']) await expect(page.locator(`.crumbs ${crumb}`)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.locator('.crumbs .topic')).toBeHidden();
  await expect(page.locator('.crumbs .topic-sep')).toBeHidden();
  for (const crumb of ['.back', '.here']) await expect(page.locator(`.crumbs ${crumb}`)).toBeVisible();
  expect(await crumbsFit(page)).toBe(true);
});

test('fonts that arrive after the load timeout are measured again', async ({ page, browser, viewport, deviceScaleFactor, baseURL }) => {
  const KEYS = ['--box-w', '--ink-h', '--wide'];
  const vars = p => p.evaluate(keys => {
    const cs = getComputedStyle(document.querySelector('#eq'));
    return { fs: cs.fontSize, ...Object.fromEntries(keys.map(k => [k, parseFloat(cs.getPropertyValue(k))])) };
  }, KEYS);
  const normal = await vars(page);
  // A fresh context (nothing cached) where the font files arrive after
  // fontsReady() has given up at 3s, so the selector, and then the play
  // screen once Level 1 is chosen, are first laid out in a fallback font.
  const context = await browser.newContext({ viewport, deviceScaleFactor, baseURL });
  try {
    const late = await context.newPage();
    await late.route('https://fonts.gstatic.com/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 5500));
      await route.continue().catch(() => {});
    });
    await late.goto('/', { waitUntil: 'commit' });
    await late.waitForFunction(() => !document.documentElement.classList.contains('loading'));
    await late.locator('.select .row[data-level="1"]').click();
    // Precondition: the play screen's first layout really used a fallback
    // font (so the route still delays the font files and this test can't
    // pass vacuously).
    const first = await vars(late);
    expect(Math.abs(first['--box-w'] - normal['--box-w']), 'fallback --box-w').toBeGreaterThan(0.01);
    await late.waitForFunction(() => document.fonts.check('500 64px "IBM Plex Mono"') && [...document.fonts].some(
      f => f.family.replace(/"/g, '') === 'IBM Plex Mono' && f.weight === '500' && f.status === 'loaded'), null, { timeout: 15_000 });
    expect((await vars(late)).fs).toBe(normal.fs);
    await expect.poll(async () => {
      const v = await vars(late);
      return Math.max(...KEYS.map(k => Math.abs(v[k] - normal[k])));
    }).toBeLessThanOrEqual(1e-3);
  } finally {
    await context.close();
  }
});

test('a new device pixel ratio alone is measured again', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the phone ratio is forced by a launch flag, so it cannot be emulated');
  // As laid out: the written length carries a quarter-step bias (onLayoutGrid).
  const caretHeight = () => page.evaluate(() => document.querySelector('.caret').getBoundingClientRect().height);
  const before = await caretHeight();
  // Count finished layouts from here on.
  await page.evaluate(() => {
    const { layout } = window.mathtime;
    const render = layout.afterMeasure;
    window.layoutsDone = 0;
    layout.afterMeasure = () => { window.layoutsDone++; render(); };
  });
  // Same CSS size, so ResizeObserver stays silent: only the ratio changes.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.layoutsDone)).toBeGreaterThan(0);
  // The caret is snapped outward to whole device pixels, so a re-measure at
  // 2x changes its height. That change is the real check.
  await expect.poll(caretHeight).not.toBe(before);
  // Secondary: the new height is on the 2x grid (the 1x height was too).
  expect(Number.isInteger((await caretHeight()) * 2)).toBe(true);
});

test('a malformed --gutter cannot break the width fit', async ({ page }) => {
  // The gutter is read from CSS; a bad value must fall back to a length.
  await page.addStyleTag({ content: ':root{--gutter:oops}' });
  await page.setViewportSize({ width: 280, height: 700 });   // drops the phone to 1x; measures no pixels
  await expect.poll(async () => await fontSize(page) < await cssFontSize(page)).toBe(true);
  const g = await page.evaluate(() => {
    const e = document.querySelector('#eq').getBoundingClientRect();
    return { left: e.left, right: innerWidth - e.right, scroll: document.documentElement.scrollWidth - innerWidth };
  });
  expect(g.left).toBeGreaterThanOrEqual(0);
  expect(g.right).toBeGreaterThanOrEqual(0);
  expect(g.scroll).toBeLessThanOrEqual(0);
});
