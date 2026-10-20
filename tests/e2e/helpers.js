import { PNG } from 'pngjs';

// Load the game and wait until fonts are in and the first layout is done.
export async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
}

// For pixel measurement: plain background (no grid), a hidden caret (its rect
// still works) and a transparent dashed outline (it still counts in layout).
// None of these change layout.
const HIDE_OUTLINE = '.slot::after{outline-color:transparent!important}';
export async function freeze(page) {
  await page.addStyleTag({
    content: 'body{background:#12407e!important}.caret{visibility:hidden!important}' + HIDE_OUTLINE,
  });
}

// Undo freeze()'s transparent outline, to measure the outline itself.
export const showOutline = page => page.evaluate(rule => {
  for (const style of document.querySelectorAll('style')) style.textContent = style.textContent.replace(rule, '');
}, HIDE_OUTLINE);

// Wait out a resize: ResizeObserver reports it, then the layout runs in the
// next animation frame.
export const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));

// Put a known problem on screen (uses the handle main.js exposes for tests).
export async function setProblem(page, a, b) {
  await page.evaluate(([a, b]) => {
    const { game, view } = window.mathtime;
    game.state.problem = { a, b, answer: a + b };
    view.render(game.state);
  }, [a, b]);
}

export async function rect(page, selector, index = 0) {
  return page.evaluate(([sel, i]) => {
    const r = document.querySelectorAll(sel)[i].getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }, [selector, index]);
}

// Ink of a problem digit's cells (#a or #b), with room above and below their 1em box.
export async function digitInk(page, shot, selector) {
  const r = await rect(page, selector);
  return ink(shot, { ...r, top: r.top - 4, bottom: r.bottom + 4 });
}

// The digit ink band is the union of all ten digits (spec §6), so render the
// digits in pairs and combine their ink.
export async function digitBand(page) {
  let top = Infinity, bottom = -Infinity;
  for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]]) {
    await setProblem(page, a, b);
    const shot = await capture(page);
    for (const sel of ['#a', '#b']) {
      const box = await digitInk(page, shot, sel);
      top = Math.min(top, box.top);
      bottom = Math.max(bottom, box.bottom);
    }
  }
  return { top, bottom, mid: (top + bottom) / 2 };
}

// The window around the answer box for pixel measurement: room for the
// dashed outline at the sides and below, starting below the "Question N"
// label (it comes within reach of the box on narrow screens), and inside
// the problem area (the keypad's key rings are ink-coloured too).
async function boxWindow(page) {
  const s = await rect(page, '#slot');
  const q = await rect(page, '#qnum');
  const stage = await rect(page, '.stage');
  const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#eq')).fontSize));
  const top = Math.max(s.top - fs / 2, q.bottom, stage.top);
  return { s, top, bottom: Math.min(s.bottom + fs / 2, stage.bottom), side: Math.max(fs / 4, 8) };
}

// The answer box's outer edges, measured from pixels (it is a pseudo-element).
// Needs freeze(), which hides the dashed outline.
export async function boxEdges(page, shot) {
  const { s, top, bottom } = await boxWindow(page);
  return ink(shot, { left: s.left - 2, right: s.right + 2, top, bottom });
}

// The dashed outline's outer edges, from pixels. Needs showOutline() after freeze().
export async function outlineEdges(page, shot) {
  const { s, top, bottom, side } = await boxWindow(page);
  return ink(shot, { left: s.left - side, right: s.right + side, top, bottom }, OUTLINE);
}

export async function capture(page) {
  const dpr = await page.evaluate(() => devicePixelRatio);
  return { png: PNG.sync.read(await page.screenshot({ animations: 'disabled' })), dpr };
}

const BG = [18, 64, 126];       // #12407e
const INK = [238, 245, 255];   // #eef5ff
export const MUTED = [182, 205, 238];     // #b6cdee: operators, crumbs, "Question N"
export const LOST = [143, 176, 221];      // #8fb0dd: a lost heart
// The dashed outline, ink at 55% opacity (stored as 140/255) over the background.
export const OUTLINE = INK.map((c, i) => Math.round(BG[i] + (c - BG[i]) * 140 / 255));

// Sub-pixel bounds (CSS px) of `colour` ink inside `area` (CSS px), from real
// screenshot pixels. A pixel's coverage is the average over R, G and B of how
// far it has moved from the background #12407e (18, 64, 126) towards the ink
// colour, clamped to 0..1. Averaging the channels keeps this correct for
// anti-aliased edges. Other colours do not score zero (the amber caret reads
// about 0.6 against the default ink), so hide them first: freeze() hides the
// caret.
// Returns null when the area is empty, off-screen or holds no ink.
export function ink({ png, dpr }, area, colour = INK) {
  const x0 = Math.max(0, Math.floor(area.left * dpr));
  const x1 = Math.min(png.width, Math.ceil(area.right * dpr));
  const y0 = Math.max(0, Math.floor(area.top * dpr));
  const y1 = Math.min(png.height, Math.ceil(area.bottom * dpr));
  if (x1 <= x0 || y1 <= y0) return null;
  const chans = [0, 1, 2].filter(c => colour[c] !== BG[c]);
  if (chans.length === 0) return null;
  const rows = new Float64Array(y1 - y0);
  const cols = new Float64Array(x1 - x0);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      let sum = 0;
      for (const c of chans) sum += (png.data[i + c] - BG[c]) / (colour[c] - BG[c]);
      const f = Math.min(1, Math.max(0, sum / chans.length));
      if (f > rows[y - y0]) rows[y - y0] = f;
      if (f > cols[x - x0]) cols[x - x0] = f;
    }
  }
  const MIN = 0.05;
  let t = 0, b = rows.length - 1, l = 0, r = cols.length - 1;
  while (t < rows.length && rows[t] < MIN) t++;
  if (t === rows.length) return null;
  while (rows[b] < MIN) b--;
  while (cols[l] < MIN) l++;
  while (cols[r] < MIN) r--;
  const top = (y0 + t + 1 - rows[t]) / dpr;
  const bottom = (y0 + b + rows[b]) / dpr;
  const left = (x0 + l + 1 - cols[l]) / dpr;
  const right = (x0 + r + cols[r]) / dpr;
  return { top, bottom, left, right, midY: (top + bottom) / 2, midX: (left + right) / 2 };
}

// Type a string on the physical keyboard (digits, then optional Enter).
export async function typeKeys(page, keys) {
  for (const k of keys) await page.keyboard.press(k);
}

// Spec target 0.5px; ink() itself measures to ~0.01px (tests/e2e/measure.spec.js), 0.05px slack.
export const TOL = 0.55;
