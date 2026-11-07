import { test, expect } from '@playwright/test';
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

// For pixel measurement: plain background (no grid) and a hidden caret (its
// rect still works). Neither changes layout. (It also hid the box's dashed
// outline until that was removed, 2026-11-06: there is nothing left to hide.)
export async function freeze(page) {
  await page.addStyleTag({
    content: 'body{background:#12407e!important}.caret{visibility:hidden!important}',
  });
}

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

// The answer to a ○ b by the level's operator, "+", "−", "×" or "÷". It
// runs in the page, so it is spelled out in each helper that sets a problem.

// A new problem, laid out in full as when a level starts.
export const layOut = (page, a, b) => page.evaluate(([a, b]) => {
  const { game, layout } = window.mathtime;
  const solve = { '+': a + b, '−': a - b, '×': a * b, '÷': a / b };
  if (!(game.level.op in solve)) throw new Error(`no answer for the operator ${game.level.op}`);
  game.state.problem = { a, b, answer: solve[game.level.op] };
  layout.layout();
}, [a, b]);

// Put a known problem on screen, centred on its ink as a new problem is
// (uses the handle main.js exposes for tests).
export async function setProblem(page, a, b) {
  await page.evaluate(([a, b]) => {
    const { game, view, layout } = window.mathtime;
    const solve = { '+': a + b, '−': a - b, '×': a * b, '÷': a / b };
    if (!(game.level.op in solve)) throw new Error(`no answer for the operator ${game.level.op}`);
    game.state.problem = { a, b, answer: solve[game.level.op] };
    view.render(game.state);
    layout.place();
  }, [a, b]);
}

// Answer questions correctly through the game itself, with no feedback in
// between, until question `n` is on screen, drawn, placed and announced as
// after the reprint.
export const playTo = (page, n) => page.evaluate(n => {
  const { game, view, layout } = window.mathtime;
  while (game.state.question < n) {
    for (const digit of String(game.state.problem.answer)) game.press(digit);
    game.press('Enter');
    game.next();
  }
  view.render(game.state);
  layout.place();
  view.announceProblem(game.state);
}, n);

// Type the answer to the problem on screen, then Enter, as the player does.
export async function answer(page) {
  const right = await page.evaluate(() => window.mathtime.game.state.problem.answer);
  await typeKeys(page, [...String(right), 'Enter']);
}

// Play the run to its end: questions answered at once through the handle,
// the last one typed. Returns once the finish screen shows.
export async function finishRun(page) {
  await playTo(page, 20);
  await answer(page);
  await page.waitForFunction(() => document.body.classList.contains('at-finish'));
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

// The window around the answer box for pixel measurement: room round the
// box above and below, starting below the "Question N"
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

// The answer box's outer edges, measured from pixels (it is a pseudo-element):
// the outside of its solid border, the edge of what you see. Needs freeze().
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

// How far the centre of what you see of the equation, from the first digit's
// ink to the box's border, is right of the problem area's centre. (It ended
// at the box's dashed outline until that was removed, 2026-11-06.) Needs
// freeze().
export async function groupOffset(page) {
  const shot = await capture(page);
  const first = await digitInk(page, shot, '#a');
  const box = await boxEdges(page, shot);
  const s = await rect(page, '.stage');
  return { offset: (first.left + box.right) / 2 - (s.left + s.right) / 2, first, box, shot };
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
// clipped away), and the box's border above its bottom (its dashed outline
// until that was removed, 2026-11-06). Needs freeze().
export async function clearances(page) {
  const shot = await capture(page);
  const stage = await rect(page, '.stage');
  const label = await labelInk(page, shot);
  const box = await boxEdges(page, shot);
  return { above: label && label.top - stage.top, below: stage.bottom - box.bottom };
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

export const BG = [18, 64, 126];       // #12407e
export const INK = [238, 245, 255];   // #eef5ff
export const MUTED = [182, 205, 238];     // #b6cdee: operators, crumbs, "Question N"
export const LOST = [143, 176, 221];      // #8fb0dd: a lost heart
export const FAINT = [111, 149, 204];     // #6f95cc: the run bar's empty segments
export const GOOD = [143, 240, 192];      // #8ff0c0: its filled ones, and "New best"

// Sub-pixel bounds (CSS px) of `colour` ink inside `area` (CSS px), from real
// screenshot pixels. A pixel's coverage is the average over R, G and B of how
// far it has moved from the background #12407e (18, 64, 126) towards the ink
// colour, clamped to 0..1. Averaging the channels keeps this correct for
// anti-aliased edges. Other colours do not score zero (the amber caret reads
// about 0.6 against the default ink), so hide them first: freeze() hides the
// caret. Text in the background colour on an ink-coloured fill ("Again") is
// read with the two swapped: `background` is what the ink is drawn on.
// Returns null when the area is empty, off-screen or holds no ink.
const MIN = 0.05;                 // below this a pixel holds no ink
export function ink(shot, area, colour = INK, background = BG) {
  const { dpr } = shot;
  const px = pixels(shot, area, colour, background);
  if (!px) return null;
  const { x0, x1, y0, y1, cover } = px;
  const rows = new Float64Array(y1 - y0);
  const cols = new Float64Array(x1 - x0);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const f = cover(x, y);
      if (f > rows[y - y0]) rows[y - y0] = f;
      if (f > cols[x - x0]) cols[x - x0] = f;
    }
  }
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

// How many device pixels in `area` (CSS px) are partly covered by `colour`,
// read as ink() reads them: neither background nor the colour, as an edge a
// fraction of a pixel off the device pixel grid leaves them. Other colours
// count too, so hide them first.
export function partlyCovered(shot, area, colour = INK) {
  const px = pixels(shot, area, colour);
  if (!px) return 0;
  const { x0, x1, y0, y1, cover } = px;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const f = cover(x, y);
      if (f >= MIN && f <= 1 - MIN) count++;
    }
  }
  return count;
}

// The device pixels of `area` (CSS px) on screen, and each one's coverage by
// `colour` on `background`, as described at ink(). Null if there are none,
// or the colour is the background.
function pixels({ png, dpr }, area, colour, background = BG) {
  const x0 = Math.max(0, Math.floor(area.left * dpr));
  const x1 = Math.min(png.width, Math.ceil(area.right * dpr));
  const y0 = Math.max(0, Math.floor(area.top * dpr));
  const y1 = Math.min(png.height, Math.ceil(area.bottom * dpr));
  if (x1 <= x0 || y1 <= y0) return null;
  const chans = [0, 1, 2].filter(c => colour[c] !== background[c]);
  if (chans.length === 0) return null;
  const cover = (x, y) => {
    const i = (y * png.width + x) * 4;
    let sum = 0;
    for (const c of chans) sum += (png.data[i + c] - background[c]) / (colour[c] - background[c]);
    return Math.min(1, Math.max(0, sum / chans.length));
  };
  return { x0, x1, y0, y1, cover };
}

// Type a string on the physical keyboard (digits, then optional Enter).
export async function typeKeys(page, keys) {
  for (const k of keys) await page.keyboard.press(k);
}

// Spec target 0.5px; ink() itself measures to ~0.01px (tests/e2e/measure.spec.js), 0.05px slack.
export const TOL = 0.55;

// ---------- Column levels (Levels 6–7 batch plan) ----------

// Put the column problem a ○ b on screen with its working in a known state,
// laid out in full as a new problem is (setProblem() alone would leave the
// working and the board stale): `cells` written, the rest empty; column
// `step` worked, with the cursor on `focus` (its answer digit unless
// given; null hides it); the columns flagged in `done` right; in `phase`,
// as question `question` with `solved` answered (one fewer by default) and
// `lives` left. By default nothing is written, question 1, full lives.
export const setColumns = (page, a, b, s = {}) => page.evaluate(([a, b, s]) => {
  const { game, board } = window.mathtime;
  const { state, level } = game;
  const { method } = level;
  if (level.kind !== 'column') throw new Error(`Level ${level.n} is not a column level`);
  state.problem = { a, b, answer: level.op === '+' ? a + b : a - b };
  state.x = method.solve(a, b);
  state.cells = { ...Object.fromEntries(method.cells.map(c => [c.id, ''])), ...s.cells };
  state.step = s.step ?? 0;
  state.focus = s.focus !== undefined ? s.focus : method.steps[state.step].cells[0];
  state.done = method.steps.map((_, k) => !!s.done?.[k]);
  state.bad = [];
  state.phase = s.phase ?? 'playing';
  state.question = s.question ?? 1;
  state.solved = s.solved ?? state.question - 1;
  state.lives = s.lives ?? level.livesPerProblem;
  board.layout(state);
  board.render(state);
}, [a, b, s]);

// The keys that work a column problem right, a column at a time, from its
// working x: in each column the digit, then the carry where there is one
// (Level 6); the borrow first where one is needed, Up and the new tens
// digit (Level 7). playColumnsTo() spells the same out in the page.
export const workKeys = (n, x) => n === 6
  ? [String(x.O), ...(x.C ? ['1'] : []), 'Enter', String(x.T), ...(x.H ? ['1'] : []), 'Enter']
  : [...(x.need ? ['ArrowUp', String(x.B)] : []), String(x.O), 'Enter', String(x.T), 'Enter'];

// Type the working of the column problem on screen, right, as the player does.
export async function work(page) {
  const { n, x } = await page.evaluate(() => ({ n: window.mathtime.game.level.n, x: window.mathtime.game.state.x }));
  await typeKeys(page, workKeys(n, x));
}

// A column level's playTo(): problems worked right through the game itself,
// with no feedback in between, until question `n` is on screen, drawn,
// placed and announced as after the reprint.
export const playColumnsTo = (page, n) => page.evaluate(n => {
  const { game, board } = window.mathtime;
  const keys = x => game.level.n === 6
    ? [String(x.O), ...(x.C ? ['1'] : []), 'Enter', String(x.T), ...(x.H ? ['1'] : []), 'Enter']
    : [...(x.need ? ['ArrowUp', String(x.B)] : []), String(x.O), 'Enter', String(x.T), 'Enter'];
  while (game.state.question < n) {
    for (const key of keys(game.state.x)) game.press(key);
    game.next();
  }
  board.layout(game.state);
  board.render(game.state);
  board.announceProblem(game.state);
}, n);

// Play a column level's run to its end: problems worked at once through the
// handle, the last one typed. Returns once the finish screen shows.
export async function finishColumnRun(page) {
  await playColumnsTo(page, 20);
  await work(page);
  await page.waitForFunction(() => document.body.classList.contains('at-finish'));
}

// The board's cell `id`, and what the cell holds as drawn.
export const boardCell = (page, id) => page.locator(`.board .cell[data-tap="${id}"]`);
export const written = (page, id) => boardCell(page, id).locator('.v');

// The approved mockup (a record), whose play screen is the board's design.
export const MOCKUP = '/docs/superpowers/specs/2026-11-05-column-methods-mockup.html';

// Hold the board's caret still, the same way on both pages: no blink, so it shows.
export const holdCaret = page => page.addStyleTag({ content: '.board .caret{animation:none!important}' });

// The problem area as drawn, every device pixel of it.
export const stageShot = async page => PNG.sync.read(await page.locator('.stage').screenshot({ animations: 'disabled' }));

// How two screenshots differ: the device pixels whose colour differs at all,
// the largest difference in any channel (0 to 255), and the box (device
// pixels) they lie in. Screenshots of different sizes differ everywhere.
export function pixelDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return { count: Infinity, max: 255, box: null, size: `${a.width}×${a.height} against ${b.width}×${b.height}` };
  }
  let count = 0, max = 0, box = null;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      let d = 0;
      for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a.data[i + c] - b.data[i + c]));
      if (!d) continue;
      count++;
      max = Math.max(max, d);
      box = box ? { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x), bottom: Math.max(box.bottom, y) }
        : { left: x, top: y, right: x, bottom: y };
    }
  }
  return { count, max, box };
}

// The mockup links the live /src/styles.css, whose board rules (scoped
// under .board) outrank its own inline ones: left in, they would draw the
// mockup with the build's CSS, and a change to it would show on both pages
// alike. So every rule of its copy that is the build's board's (one whose
// selector names .board, data-kind or #ans) is taken out, and the mockup
// draws with its own approved rules alone.
const ownRulesOnly = mock => mock.evaluate(() => new Promise(resolve => {
  const sheet = [...document.styleSheets].find(s => s.href && new URL(s.href).pathname === '/src/styles.css');
  if (!sheet) throw new Error('the mockup links no /src/styles.css');
  let taken = 0;
  const strip = list => {
    for (let i = list.cssRules.length - 1; i >= 0; i--) {
      const rule = list.cssRules[i];
      if (rule.selectorText === undefined && rule.cssRules) strip(rule);   // @media, @supports
      else if (/\.board|data-kind|#ans/.test(rule.selectorText ?? '')) {
        list.deleteRule(i);
        taken++;
      }
    }
  };
  strip(sheet);
  if (!taken) throw new Error('no board rules found in the mockup\'s styles.css');
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

// Compare the build's problem area, as `page` shows it now, with the
// mockup's play screen for Level `n` in its fixed `state` (empty, partial,
// wrong or done), pixel for pixel: at the project's own size, then at
// 320×640 and 844×390 through resize(). `ready` waits on either page until
// its state is settled; `tweak` changes the build's page before each
// screenshot (the controls use it). Returns each size's difference
// (pixelDiff()).
export async function againstMockup(page, n, state, { ready = async () => {}, tweak = async () => {} } = {}) {
  const mock = await page.context().newPage();
  await mock.goto(`${MOCKUP}?view=play&level=${n}&state=${state}`);
  await mock.waitForFunction(() => !document.documentElement.classList.contains('loading'));
  await ownRulesOnly(mock);
  await ready(mock);
  for (const p of [mock, page]) {
    await holdCaret(p);
    await settle(p);
  }
  const found = [];
  for (const size of [null, [320, 640], [844, 390]]) {
    if (size) for (const p of [mock, page]) await resize(p, ...size);
    const sizes = await Promise.all([mock, page].map(p => p.evaluate(() => `${innerWidth}×${innerHeight}@${devicePixelRatio}`)));
    if (sizes[0] !== sizes[1]) throw new Error(`the pages differ in size: mockup ${sizes[0]}, build ${sizes[1]}`);
    await tweak(page);
    found.push({ at: sizes[1], ...pixelDiff(await stageShot(page), await stageShot(mock)) });
  }
  await mock.close();
  return found;
}

// Every size the same as the mockup, to the device pixel.
export function expectSame(found) {
  for (const { at, count, max, box } of found) {
    note(`${at}: device pixels that differ from the mockup`, count, '');
    expect(count, `${at}: ${count} device pixels differ, by up to ${max}, in ${JSON.stringify(box)}`).toBe(0);
  }
}

// A wrong check settled: said, and its red-line cleared (the build's), or
// its shake over (the column-methods mockup's, a record of its design).
export const shaken = page => page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Wrong')
  && !document.querySelector('.board .shake, .board .fx, .board .redframe'));

// From now on, which of the board's cells are marked wrong by the red-line
// (their ids, as each is drawn): a wrong digit struck through, an empty cell
// framed in red. The function returned waits for them to clear, then says.
export async function strikes(page) {
  await page.evaluate(() => {
    window.struck = [];
    new MutationObserver(records => {
      for (const r of records) for (const node of r.addedNodes) {
        if (node.classList?.contains('redline') || node.classList?.contains('redframe')) window.struck.push(node.dataset.cell);
      }
    }).observe(document.querySelector('.board'), { childList: true, subtree: true });
  });
  return async () => {
    await page.waitForFunction(() => window.struck.length && !document.querySelector('.board .fx, .board .redframe'));
    return page.evaluate(() => window.struck.sort());
  };
}

// From now on, every status text in turn: the returned function says them.
export async function listen(page) {
  await page.evaluate(() => {
    window.said = [];
    const status = document.querySelector('#status');
    new MutationObserver(() => window.said.push(status.textContent)).observe(status, { childList: true, characterData: true, subtree: true });
  });
  return () => page.evaluate(() => window.said);
}

// Dispatch `key` on the answer field, as the keyboard does; returns the
// keypad keys then flashing.
export const flashFor = (page, key) => page.evaluate(k => {
  document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  return [...document.querySelectorAll('.pad button.pressed')].map(b => b.dataset.k);
}, key);
