import { test, expect } from '@playwright/test';
import { open, freeze, setProblem, rect, capture, ink, TOL } from './helpers.js';

// The digit ink band is the union of all ten digits (spec §6), so render the
// digits in pairs and combine their ink.
async function digitBand(page) {
  let top = Infinity, bottom = -Infinity;
  for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]]) {
    await setProblem(page, a, b);
    const shot = await capture(page);
    for (const sel of ['#a', '#b']) {
      const r = await rect(page, sel);
      const box = ink(shot, { ...r, top: r.top - 4, bottom: r.bottom + 4 });
      top = Math.min(top, box.top);
      bottom = Math.max(bottom, box.bottom);
    }
  }
  return { top, bottom, mid: (top + bottom) / 2 };
}

// The answer box's outer edges, measured from pixels (it is a pseudo-element).
// The window starts below the "Question N" label, which comes within reach of
// the box on narrow screens.
async function boxEdges(page, shot) {
  const s = await rect(page, '#slot');
  const q = await rect(page, '#qnum');
  const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#eq')).fontSize));
  return ink(shot, { left: s.left - 2, right: s.right + 2, top: Math.max(s.top - fs / 2, q.bottom), bottom: s.bottom + fs / 2 });
}

// The box's outer edges and centre, and the area inside its border (with 1px
// to spare) where answers are measured.
async function boxInside(page) {
  const bw = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#eq')).getPropertyValue('--bw')));
  const outer = await boxEdges(page, await capture(page));
  const inner = { left: outer.left + bw + 1, right: outer.right - bw - 1, top: outer.top + bw + 1, bottom: outer.bottom - bw - 1 };
  return { bw, outer, inner, centre: (outer.left + outer.right) / 2 };
}

// The inner edges of the box border, from pixels: each side's border alone,
// in a strip wider than the border and narrower than the padding.
function borderInner(shot, outer, bw) {
  const w = bw + 3;
  return {
    left: ink(shot, { left: outer.left - 1, right: outer.left + w, top: outer.top + w, bottom: outer.bottom - w }).right,
    right: ink(shot, { left: outer.right - w, right: outer.right + 1, top: outer.top + w, bottom: outer.bottom - w }).left,
    top: ink(shot, { left: outer.left + w, right: outer.right - w, top: outer.top - 1, bottom: outer.top + w }).bottom,
    bottom: ink(shot, { left: outer.left + w, right: outer.right - w, top: outer.bottom - w, bottom: outer.bottom + 1 }).top,
  };
}

// Space between the stage edges and the equation, its dashed outline included.
const gutters = page => page.evaluate(() => {
  const eq = document.querySelector('#eq');
  const e = eq.getBoundingClientRect();
  const s = document.querySelector('.stage').getBoundingClientRect();
  const over = parseFloat(getComputedStyle(eq).getPropertyValue('--overhang')) || 0;
  return { left: e.left - s.left, right: s.right - (e.right + over), scroll: document.documentElement.scrollWidth - innerWidth, phone: innerWidth <= 480 };
});

const fontSize = page => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#eq')).getPropertyValue('--fs')));

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
    const op = ink(shot, await rect(page, '.op', i), [182, 205, 238]);   // muted #b6cdee
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

// Show an answer in the box directly (typing itself is tested in flows.spec.js).
const showAnswer = (page, typed) => page.evaluate(t => {
  const { game, view } = window.mathtime;
  game.state.typed = t;
  view.renderAnswer(t);
}, typed);

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
  expect(Math.abs(answer.bottom - problem.bottom), 'ink bottom').toBeLessThanOrEqual(TOL);
  expect(Math.abs(answer.top - problem.top), 'ink top').toBeLessThanOrEqual(TOL);
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
  for (const [side, gap] of Object.entries(gaps)) {
    expect(Math.abs(gap - pad), `answer ${widest.n}, ${side} padding`).toBeLessThanOrEqual(TOL);
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

test('keypad digit labels are centred on their ink', async ({ page }) => {
  const shot = await capture(page);
  for (const k of '0123456789') {
    const r = await rect(page, `.pad button[data-k="${k}"]`);
    const label = ink(shot, { left: r.left + 4, right: r.right - 4, top: r.top + 4, bottom: r.bottom - 4 });
    expect(Math.abs(label.midY - (r.top + r.height / 2)), `key ${k} vertical`).toBeLessThanOrEqual(TOL);
    expect(Math.abs(label.midX - (r.left + r.width / 2)), `key ${k} horizontal`).toBeLessThanOrEqual(TOL);
  }
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
  // Wait until the equation is smaller than its CSS size (the clamp() in
  // styles.css, read from a probe with the same class).
  await expect.poll(() => page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'eq';
    probe.style.cssText = 'position:absolute;visibility:hidden';
    document.querySelector('.stage').appendChild(probe);
    const css = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return parseFloat(getComputedStyle(document.querySelector('#eq')).fontSize) < css;
  })).toBe(true);
  const g = await gutters(page);
  expect(g.left).toBeGreaterThanOrEqual(16 - 0.01);
  expect(g.right).toBeGreaterThanOrEqual(16 - 0.01);
  expect(g.scroll).toBeLessThanOrEqual(0);
  const digits = await digitBand(page);
  const shot = await capture(page);
  const box = await boxEdges(page, shot);
  const plus = ink(shot, await rect(page, '.op', 0), [182, 205, 238]);   // muted #b6cdee
  expect(Math.abs(box.midY - digits.mid), 'box').toBeLessThanOrEqual(TOL);
  expect(Math.abs(plus.midY - digits.mid), '+').toBeLessThanOrEqual(TOL);
});

test('the header stays on one line at 320px wide', async ({ page }) => {
  // Note: setViewportSize drops the phone project to 1x; this test measures no pixels.
  await page.setViewportSize({ width: 320, height: 640 });
  await expect.poll(() => page.evaluate(() => {
    const where = document.querySelector('.where');
    return document.querySelector('.crumbs').scrollWidth <= where.clientWidth;
  })).toBe(true);
  await expect(page.locator('.crumbs .here')).toBeVisible();
});

test('fonts that arrive after the load timeout are measured again', async ({ page, browser, viewport, deviceScaleFactor, baseURL }) => {
  const KEYS = ['--box-w', '--ink-h', '--wide'];
  const vars = p => p.evaluate(keys => {
    const cs = getComputedStyle(document.querySelector('#eq'));
    return { fs: cs.fontSize, ...Object.fromEntries(keys.map(k => [k, parseFloat(cs.getPropertyValue(k))])) };
  }, KEYS);
  const normal = await vars(page);
  // A fresh context (nothing cached) where the font files arrive after
  // fontsReady() has given up at 3s, so the first layout uses a fallback font.
  const context = await browser.newContext({ viewport, deviceScaleFactor, baseURL });
  try {
    const late = await context.newPage();
    await late.route('https://fonts.gstatic.com/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 5500));
      await route.continue().catch(() => {});
    });
    await late.goto('/', { waitUntil: 'commit' });
    await late.waitForFunction(() => !document.documentElement.classList.contains('loading'));
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
  const caretHeight = () => page.evaluate(() => parseFloat(document.querySelector('.caret').style.height));
  const before = await caretHeight();
  // Same CSS size, so ResizeObserver stays silent: only the ratio changes.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
  // The caret is snapped outward to whole device pixels, so a re-measure at
  // 2x moves its height onto the half-pixel grid.
  await expect.poll(caretHeight).not.toBe(before);
  expect(Number.isInteger((await caretHeight()) * 2)).toBe(true);
});
