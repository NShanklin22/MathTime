import { test } from '@playwright/test';
import { PNG } from 'pngjs';

// Load the game, wait until fonts are in and it is laid out on the level
// selector, then choose Level `level` as the player does.
export async function open(page, level = 1) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
  await levelRow(page, level).click();
  await page.waitForFunction(() => !document.body.classList.contains('at-select'));
}

// The level selector's row for Level `n`.
export const levelRow = (page, n) => page.locator(`.select .row[data-level="${n}"]`);

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

// Resize the page, keeping the project's own pixel ratio. setViewportSize
// would drop the phone project's real 2x to 1x, so the phone's size is
// emulated. The desktop project's viewport belongs to Playwright, which puts
// it back for screenshots, so that one is resized through Playwright (1x).
export async function resize(page, width, height) {
  if (test.info().project.name === 'phone') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  } else {
    await page.setViewportSize({ width, height });
  }
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
  await settle(page);
}

// Records a measurement in the test report, so drift shows: a length in px,
// unless another unit is given ('' for a ratio).
export const note = (type, value, unit = 'px') => test.info().annotations.push({ type, description: `${value.toFixed(3)}${unit}` });

// The equation's font size as laid out (what layout.js fitted).
export const fontSize = page => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#eq')).fontSize));

// The equation's CSS size (the clamp() in styles.css), from a probe with the same class.
export const cssFontSize = page => page.evaluate(() => {
  const probe = document.createElement('div');
  probe.className = 'eq';
  probe.style.cssText = 'position:absolute;visibility:hidden';
  document.querySelector('.stage').appendChild(probe);
  const size = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return size;
});

// A new problem, laid out in full as when a level starts.
export const layOut = (page, a, b) => page.evaluate(([a, b]) => {
  const { game, layout } = window.mathtime;
  game.state.problem = { a, b, answer: game.level.op === '+' ? a + b : a - b };
  layout.layout();
}, [a, b]);

// Put a known problem on screen, centred on its ink as a new problem is
// (uses the handle main.js exposes for tests).
export async function setProblem(page, a, b) {
  await page.evaluate(([a, b]) => {
    const { game, view, layout } = window.mathtime;
    game.state.problem = { a, b, answer: game.level.op === '+' ? a + b : a - b };
    view.render(game.state);
    layout.place();
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
  const side = Math.max(fs / 4, 8);
  const top = Math.max(s.top - fs / 2 - side, q.bottom, stage.top);
  return {
    s, top, bottom: Math.min(s.bottom + fs / 2 + side, stage.bottom),
    left: Math.max(s.left - side, stage.left), right: Math.min(s.right + side, stage.right),
  };
}

// The answer box's outer edges, measured from pixels (it is a pseudo-element).
// Needs freeze(), which hides the dashed outline.
export async function boxEdges(page, shot) {
  const { s, top, bottom } = await boxWindow(page);
  return ink(shot, { left: s.left - 2, right: s.right + 2, top, bottom });
}

// The box's outer edges and centre, and the area inside its border (with 1px
// to spare) where answers are measured. Needs freeze().
export async function boxInside(page) {
  const bw = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#eq')).getPropertyValue('--bw')));
  const outer = await boxEdges(page, await capture(page));
  const inner = { left: outer.left + bw + 1, right: outer.right - bw - 1, top: outer.top + bw + 1, bottom: outer.bottom - bw - 1 };
  return { bw, outer, inner, centre: (outer.left + outer.right) / 2 };
}

// The inner edges of the box border, from pixels: each side's border alone,
// in a strip wider than the border and narrower than the padding.
export function borderInner(shot, outer, bw) {
  const w = bw + 3;
  return {
    left: ink(shot, { left: outer.left - 1, right: outer.left + w, top: outer.top + w, bottom: outer.bottom - w }).right,
    right: ink(shot, { left: outer.right - w, right: outer.right + 1, top: outer.top + w, bottom: outer.bottom - w }).left,
    top: ink(shot, { left: outer.left + w, right: outer.right - w, top: outer.top - 1, bottom: outer.top + w }).bottom,
    bottom: ink(shot, { left: outer.left + w, right: outer.right - w, top: outer.bottom - w, bottom: outer.bottom + 1 }).top,
  };
}

// Show an answer in the box directly (typing itself is tested in flows.spec.js).
export const showAnswer = (page, typed) => page.evaluate(t => {
  const { game, view } = window.mathtime;
  game.state.typed = t;
  view.renderAnswer(t);
}, typed);

// The dashed outline's outer edges, from pixels. Needs showOutline() after freeze().
export async function outlineEdges(page, shot) {
  const { left, right, top, bottom } = await boxWindow(page);
  return ink(shot, { left, right, top, bottom }, OUTLINE);
}

// How far the centre of what you see of the equation, from the first digit's
// ink to the box's dashed outline, is right of the problem area's centre.
// Needs showOutline().
export async function groupOffset(page) {
  const shot = await capture(page);
  const first = await digitInk(page, shot, '#a');
  const outline = await outlineEdges(page, shot);
  const s = await rect(page, '.stage');
  return { offset: (first.left + outline.right) / 2 - (s.left + s.right) / 2, first, outline, shot };
}

// The ink gap from "=" to the box's outer edge, and the mean of the ink gaps
// either side of the second number over all ten digits (the operator → digit
// and digit → "="). Needs freeze().
export async function equalsGap(page) {
  let sum = 0;
  for (let b = 0; b <= 9; b++) {
    await setProblem(page, 5, b);
    const shot = await capture(page);
    const op = ink(shot, await rect(page, '#eq .op', 0), MUTED);
    const digit = await digitInk(page, shot, '#b');
    const equals = ink(shot, await rect(page, '#eq .op', 1), MUTED);
    sum += (digit.left - op.right) + (equals.left - digit.right);
  }
  const shot = await capture(page);
  const equals = ink(shot, await rect(page, '#eq .op', 1), MUTED);
  return { mean: sum / 20, gap: (await boxEdges(page, shot)).left - equals.right };
}

// "Question N"'s ink, as far as the problem area shows it (it clips the rest).
export async function labelInk(page, shot) {
  const q = await rect(page, '#qnum');
  const stage = await rect(page, '.stage');
  return ink(shot, { left: q.left - 4, right: q.right + 4, top: Math.max(q.top - 4, stage.top), bottom: Math.min(q.bottom + 4, stage.bottom) }, MUTED);
}

// How far "Question N"'s ink is below the problem area's top (null if it is
// clipped away), and the box's dashed outline above its bottom. Needs
// showOutline().
export async function clearances(page) {
  const shot = await capture(page);
  const stage = await rect(page, '.stage');
  const label = await labelInk(page, shot);
  const outline = await outlineEdges(page, shot);
  return { above: label && label.top - stage.top, below: stage.bottom - outline.bottom };
}

// How far each digit key's label ink is from its key's centre, worst case
// across and down. Needs freeze().
export async function keyLabelOffsets(page) {
  const shot = await capture(page);
  let across = 0, down = 0;
  for (const k of '0123456789') {
    const r = await rect(page, `.pad button[data-k="${k}"]`);
    const label = ink(shot, { left: r.left + 4, right: r.right - 4, top: r.top + 4, bottom: r.bottom - 4 });
    across = Math.max(across, Math.abs(label.midX - (r.left + r.width / 2)));
    down = Math.max(down, Math.abs(label.midY - (r.top + r.height / 2)));
  }
  return { across, down };
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
