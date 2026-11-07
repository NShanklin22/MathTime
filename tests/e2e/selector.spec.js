import { test, expect } from '@playwright/test';
import { open, levelRow, setProblem, rect, resize, settle, capture, ink, freeze, note, typeKeys, TOL, MUTED, GOOD } from './helpers.js';
import { LEVELS, levelName } from '../../src/levels.js';

// The level selector (Level 2 spec §3).

// Load the game as it opens: on the selector.
async function home(page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
}

// The rows as shown (Levels 6–7 batch plan): by topic, each topic where it
// first comes in route order, and in route order within it.
const SHOWN = [1, 6, 2, 3, 7, 4, 5];

// Level `n` (its build order) as the play screen names it: "Subtraction 3".
const named = n => levelName(LEVELS.find(level => level.n === n));

test('the game opens on the selector: the built levels by topic, nothing marked', async ({ page }) => {
  await home(page);
  await expect(page.locator('.select')).toBeVisible();
  for (const hidden of ['.stage', '.pad', '.lives']) await expect(page.locator(hidden)).toBeHidden();
  // A landmark of its own: the only <main> is the hidden problem area.
  const list = page.getByRole('region', { name: 'Levels' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('button')).toHaveCount(7);
  await expect(page.locator('#status')).toBeEmpty();   // no problem yet, so nothing announced
  await expect(page.locator('.select .group-name')).toHaveText(['Addition', 'Subtraction', 'Multiplication', 'Division']);
  await expect(page.locator('.select .group')).toHaveCount(4);
  await expect(page.locator('.select .group').nth(0).locator('.row')).toHaveCount(2);
  await expect(page.locator('.select .group').nth(0).locator('.row').nth(0)).toHaveAttribute('data-level', '1');
  await expect(page.locator('.select .group').nth(0).locator('.row').nth(1)).toHaveAttribute('data-level', '6');
  await expect(page.locator('.select .group').nth(1).locator('.row')).toHaveCount(3);
  await expect(page.locator('.select .group').nth(1).locator('.row').nth(0)).toHaveAttribute('data-level', '2');
  await expect(page.locator('.select .group').nth(1).locator('.row').nth(1)).toHaveAttribute('data-level', '3');
  await expect(page.locator('.select .group').nth(1).locator('.row').nth(2)).toHaveAttribute('data-level', '7');
  await expect(page.locator('.select .group').nth(2).locator('.row')).toHaveCount(1);
  await expect(page.locator('.select .group').nth(2).locator('.row')).toHaveAttribute('data-level', '4');
  await expect(page.locator('.select .group').nth(3).locator('.row')).toHaveCount(1);
  await expect(page.locator('.select .group').nth(3).locator('.row')).toHaveAttribute('data-level', '5');
  await expect(page.getByRole('button', { name: 'Addition, Level 1: Single-digit addition', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subtraction, Level 1: Subtraction within 10', exact: true })).toBeVisible();
  await expect(levelRow(page, 1).locator('.title')).toHaveText('Level 1');
  await expect(levelRow(page, 1).locator('.name')).toHaveText('Single-digit addition');
  await expect(levelRow(page, 1).locator('.sample')).toHaveText('3+4');
  await expect(levelRow(page, 2).locator('.sample')).toHaveText('7−3');
  await expect(page.getByRole('button', { name: 'Subtraction, Level 2: Subtraction past 10', exact: true })).toBeVisible();
  await expect(levelRow(page, 3).locator('.title')).toHaveText('Level 2');
  await expect(levelRow(page, 3).locator('.name')).toHaveText('Subtraction past 10');
  await expect(levelRow(page, 3).locator('.sample')).toHaveText('13−5');
  await expect(page.getByRole('button', { name: 'Multiplication, Level 1: Times tables', exact: true })).toBeVisible();
  await expect(levelRow(page, 4).locator('.title')).toHaveText('Level 1');
  await expect(levelRow(page, 4).locator('.name')).toHaveText('Times tables');
  await expect(levelRow(page, 4).locator('.sample')).toHaveText('6×7');
  await expect(page.getByRole('button', { name: 'Division, Level 1: Division facts', exact: true })).toBeVisible();
  await expect(levelRow(page, 5).locator('.title')).toHaveText('Level 1');
  await expect(levelRow(page, 5).locator('.name')).toHaveText('Division facts');
  await expect(levelRow(page, 5).locator('.sample')).toHaveText('56÷8');
  await expect(page.getByRole('button', { name: 'Addition, Level 2: Column addition', exact: true })).toBeVisible();
  await expect(levelRow(page, 6).locator('.title')).toHaveText('Level 2');
  await expect(levelRow(page, 6).locator('.name')).toHaveText('Column addition');
  await expect(levelRow(page, 6).locator('.sample')).toHaveText('47+38');
  await expect(page.getByRole('button', { name: 'Subtraction, Level 3: Column subtraction', exact: true })).toBeVisible();
  await expect(levelRow(page, 7).locator('.title')).toHaveText('Level 3');
  await expect(levelRow(page, 7).locator('.name')).toHaveText('Column subtraction');
  await expect(levelRow(page, 7).locator('.sample')).toHaveText('52−27');
  expect(await page.locator('.select .row').evaluateAll(rows => rows.map(r => Number(r.dataset.level)))).toEqual(SHOWN);
  await expect(levelRow(page, 1).locator('.sample')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.select .row.current')).toHaveCount(0);
  await expect(page.locator('.select .row[aria-current]')).toHaveCount(0);
});

// Each level is shown by its number within its topic (k), not its build
// order (n, which only data-level and the runs kept use): under each
// heading the rows read Level 1, Level 2, …, and each row's name says its
// topic, as the heading does for the eye.
test('under each topic the rows are numbered from Level 1, and each is named with its topic', async ({ page }) => {
  await home(page);
  const groups = await page.locator('.select .group').evaluateAll(groups => groups.map(g => ({
    topic: g.querySelector('.group-name').textContent,
    titles: [...g.querySelectorAll('.row .title')].map(t => t.textContent),
    names: [...g.querySelectorAll('.row')].map(r => r.getAttribute('aria-label')),
  })));
  expect(groups).toEqual([
    { topic: 'Addition', titles: ['Level 1', 'Level 2'], names: ['Addition, Level 1: Single-digit addition', 'Addition, Level 2: Column addition'] },
    {
      topic: 'Subtraction', titles: ['Level 1', 'Level 2', 'Level 3'],
      names: ['Subtraction, Level 1: Subtraction within 10', 'Subtraction, Level 2: Subtraction past 10', 'Subtraction, Level 3: Column subtraction'],
    },
    { topic: 'Multiplication', titles: ['Level 1'], names: ['Multiplication, Level 1: Times tables'] },
    { topic: 'Division', titles: ['Level 1'], names: ['Division, Level 1: Division facts'] },
  ]);
  // The build order stays the rows' handle.
  expect(await page.locator('.select .row').evaluateAll(rows => rows.map(r => Number(r.dataset.level)))).toEqual(SHOWN);
  await page.getByRole('button', { name: 'Subtraction, Level 3: Column subtraction', exact: true }).click();
  await expect(page.locator('.crumbs .here')).toHaveText('Subtraction 3');
  expect(await page.evaluate(() => window.mathtime.game.level.n)).toBe(7);
});

// Each row's sample is written on one line, as the others are: its parts
// side by side, operator between, on one baseline band.
test('Levels 6 and 7\'s samples, 47 + 38 and 52 − 27, are each on one line', async ({ page }) => {
  await home(page);
  for (const n of [6, 7]) {
    const parts = await levelRow(page, n).locator('.sample > span').evaluateAll(spans => spans.map(s => {
      const r = s.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, height: r.height };
    }));
    expect(parts, `Level ${n}`).toHaveLength(3);
    for (let i = 1; i < 3; i++) expect(parts[i].left, `Level ${n}: part ${i + 1} after part ${i}`).toBeGreaterThanOrEqual(parts[i - 1].right);
    const op = await levelRow(page, n).locator('.sample .op').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    for (const p of [parts[0], parts[2]]) expect(Math.abs(p.top - parts[0].top), `Level ${n}: one line`).toBeLessThanOrEqual(0.01);
    expect(Math.abs(parts[0].height - op), `Level ${n}: a single line high`).toBeLessThanOrEqual(0.01);
  }
});

// Not a fact level: each starts on its column board, its first problem
// announced and the answer field focused, on its first cell.
for (const [n, word] of [[6, 'plus'], [7, 'minus']]) test(`choosing Level ${n} starts it on the column board at question 1 with 3 lives`, async ({ page }) => {
  await home(page);
  await levelRow(page, n).click();
  await expect(page.locator('.select')).toBeHidden();
  await expect(page.locator('.board .qlabel')).toBeVisible();   // the board itself is a zero-size box: all it holds is placed
  await expect(page.locator('#eq')).toBeHidden();
  await expect(page.locator('.board .qlabel')).toHaveText('Question 1 of 20');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await expect(page.locator('#ans')).toBeFocused();
  await expect(page.locator('#ans')).toHaveAttribute('aria-label', 'Ones, answer');
  await expect(page.locator('.crumbs .here')).toHaveText(named(n));
  await expect(page.locator('#status')).toHaveText(new RegExp(`^Question 1 of 20: \\d\\d ${word} \\d\\d$`));
});

// From a column level back to a fact level: the equation as ever, the field
// back in its box.
test('after a column level, a fact level plays as before', async ({ page }) => {
  await home(page);
  await levelRow(page, 7).click();
  await page.keyboard.press('Escape');
  await levelRow(page, 1).click();
  await expect(page.locator('.board')).toHaveCSS('display', 'none');
  await expect(page.locator('.board > *')).toHaveCount(0);
  await expect(page.locator('#eq')).toBeVisible();
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  await expect(page.locator('#slot #ans')).toBeFocused();
  await expect(page.locator('#ans')).toHaveAttribute('aria-label', 'Answer');
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeVisible();
  await setProblem(page, 3, 4);
  await typeKeys(page, ['7']);
  await expect(page.locator('#shown')).toHaveText('7');
  await expect(page.locator('#ans')).toHaveValue('7');
  await typeKeys(page, ['Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
});

test('on the selector the breadcrumb is "Levels" alone', async ({ page }) => {
  await home(page);
  await expect(page.locator('.crumbs .home')).toHaveText('Levels');
  await expect(page.locator('.crumbs .home')).toHaveAttribute('aria-current', 'page');
  for (const crumb of ['.back', '.chevron', '.sep', '.here']) await expect(page.locator(`.crumbs ${crumb}`).first()).toBeHidden();
});

const WORD = { 1: 'plus', 2: 'minus', 3: 'minus', 4: 'times', 5: 'divided by' };
for (const n of [1, 2, 3, 4, 5]) test(`choosing Level ${n} starts it at question 1 with 3 lives, focus on the answer`, async ({ page }) => {
  await home(page);
  await levelRow(page, n).click();
  await expect(page.locator('.select')).toBeHidden();
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await expect(page.locator('#ans')).toBeFocused();
  await expect(page.locator('.crumbs .here')).toHaveText(named(n));
  await expect(page.locator('.crumbs .home')).toBeHidden();
  await expect(page.locator('#status')).toHaveText(new RegExp(`^Question 1 of 20: \\d+ ${WORD[n]} \\d$`));
});

test('the rows are buttons in the tab order', async ({ page }) => {
  await home(page);
  await page.keyboard.press('Tab');
  await expect(levelRow(page, 1)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(levelRow(page, 6)).toBeFocused();       // Addition's second row
  await page.keyboard.press('Tab');
  await expect(levelRow(page, 2)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.crumbs .here')).toHaveText('Subtraction 1');
});

// The keyboard follows the rows as shown, down the groups and back up.
test('Tab and Shift+Tab go through the rows as shown: 1, 6, 2, 3, 7, 4, 5', async ({ page }) => {
  await home(page);
  for (const n of SHOWN) {
    await page.keyboard.press('Tab');
    await expect(levelRow(page, n)).toBeFocused();
  }
  for (const n of SHOWN.slice(0, -1).reverse()) {
    await page.keyboard.press('Shift+Tab');
    await expect(levelRow(page, n)).toBeFocused();
  }
});

// Coming back from Level 7 marks and focuses its row, in the Subtraction
// group, and the keyboard carries on from there.
test('back from Level 7, its row is marked and focused, and Tab goes on to Level 4', async ({ page }) => {
  await home(page);
  await levelRow(page, 7).click();
  await page.keyboard.press('Escape');
  await expect(levelRow(page, 7)).toHaveClass(/\bcurrent\b/);
  await expect(levelRow(page, 7)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(levelRow(page, 4)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(levelRow(page, 3)).toBeFocused();
});

// On a short screen the list scrolls: a row reached by Tab shows whole,
// with its focus ring (2px, 4px out), going down and coming back up.
for (const [width, height] of [[844, 390], [320, 640]]) test(`at ${width}×${height} a row reached by Tab shows with its whole focus ring`, async ({ page }) => {
  await home(page);
  await resize(page, width, height);
  const ringInside = async n => page.evaluate(n => {
    const list = document.querySelector('.select');
    const view = list.getBoundingClientRect();
    const top = view.top + list.clientTop, bottom = top + list.clientHeight;
    const r = document.querySelector(`.select .row[data-level="${n}"]`).getBoundingClientRect();
    return { above: top - (r.top - 6), below: (r.bottom + 6) - bottom };
  }, n);
  // In the order shown (the rows are grouped by topic, not by number).
  const n = await rows(page);
  expect(n).toBe(SHOWN.length);
  for (const i of SHOWN) {
    await page.keyboard.press('Tab');
    await expect(levelRow(page, i)).toBeFocused();
  }
  for (const i of SHOWN.slice(0, -1).reverse()) {
    await page.keyboard.press('Shift+Tab');
    await expect(levelRow(page, i)).toBeFocused();
  }
  for (const [i, keys] of [[SHOWN.at(-1), 'Tab'], [SHOWN[0], 'Shift+Tab']]) {
    if (keys === 'Tab') for (let k = 1; k < n; k++) await page.keyboard.press('Tab');
    else for (let k = 1; k < n; k++) await page.keyboard.press('Shift+Tab');
    await expect(levelRow(page, i)).toBeFocused();
    const { above, below } = await ringInside(i);
    expect(above, `Level ${i}'s ring below the list's top (${keys})`).toBeLessThanOrEqual(0.01);
    expect(below, `Level ${i}'s ring above the list's bottom (${keys})`).toBeLessThanOrEqual(0.01);
  }
});

test('running out of lives comes back with that level marked and focused, in white', async ({ page }) => {
  await open(page, 2);
  await setProblem(page, 7, 3);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 2)).toHaveClass(/\bcurrent\b/);
  await expect(levelRow(page, 1)).not.toHaveClass(/\bcurrent\b/);
  // Screen readers hear it too.
  await expect(levelRow(page, 2)).toHaveAttribute('aria-current', 'true');
  await expect(levelRow(page, 1)).not.toHaveAttribute('aria-current');
  await expect(levelRow(page, 2)).toBeFocused();
  // White, 2px, 4px out: amber means "current". An unfocused row has none
  // (its outline colour is the ink anyway, so the style is what tells).
  await expect(levelRow(page, 2)).toHaveCSS('outline-style', 'solid');
  await expect(levelRow(page, 2)).toHaveCSS('outline-color', 'rgb(238, 245, 255)');
  await expect(levelRow(page, 2)).toHaveCSS('outline-width', '2px');
  await expect(levelRow(page, 2)).toHaveCSS('outline-offset', '4px');
  await expect(levelRow(page, 1)).toHaveCSS('outline-style', 'none');
  await levelRow(page, 1).click();
  await expect(page.locator('.crumbs .here')).toHaveText('Addition 1');
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
});

test('the mark moves to the level you came from last', async ({ page }) => {
  const marked = async n => {
    await expect(page.locator('.select')).toBeVisible();
    await expect(page.locator('.select .row.current')).toHaveCount(1);
    await expect(page.locator('.select .row[aria-current]')).toHaveCount(1);
    await expect(levelRow(page, n)).toHaveClass(/\bcurrent\b/);
    await expect(levelRow(page, n)).toHaveAttribute('aria-current', 'true');
    await expect(levelRow(page, n)).toBeFocused();
  };
  await open(page, 1);
  await setProblem(page, 3, 4);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await marked(1);
  await levelRow(page, 2).click();
  await setProblem(page, 7, 3);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await marked(2);
});

// The list scrolls (it can outgrow a short screen), and the page never does.
test('on a short screen the list scrolls just far enough to show the marked row and its ring', async ({ page }) => {
  const RING = 6;                                         // 2px, 4px out
  await open(page, 2);
  await resize(page, 640, 320);
  await setProblem(page, 7, 3);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(levelRow(page, 2)).toBeFocused();
  const { row, view, scrolled } = await page.evaluate(() => {
    const list = document.querySelector('.select');
    const box = list.getBoundingClientRect();
    const r = list.querySelector('.row[data-level="2"]').getBoundingClientRect();
    const top = box.top + list.clientTop, left = box.left + list.clientLeft;
    return {
      row: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      // What the list shows: its padding box.
      view: { top, bottom: top + list.clientHeight, left, right: left + list.clientWidth, scrollTop: list.scrollTop },
      scrolled: [document.documentElement.scrollTop, document.body.scrollTop],
    };
  });
  expect(view.scrollTop, 'the row was below the fold, so the list scrolled').toBeGreaterThan(0);
  expect(row.top - RING, 'ring top').toBeGreaterThanOrEqual(view.top - 0.01);
  expect(row.bottom + RING, 'ring bottom').toBeLessThanOrEqual(view.bottom + 0.01);
  expect(row.left - RING, 'ring left').toBeGreaterThanOrEqual(view.left - 0.01);
  expect(row.right + RING, 'ring right').toBeLessThanOrEqual(view.right + 0.01);
  // No further than needed: the ring ends at the list's bottom edge, give or
  // take the scroll position's rounding to a whole pixel.
  expect(view.bottom - (row.bottom + RING), 'scrolled just far enough').toBeLessThan(1);
  expect(scrolled, 'the page itself never scrolls').toEqual([0, 0]);
});

// ---------- In columns (incident 2026-11-05, corrective action A) ----------

// The topic groups as they stand: each column, left to right, with its
// topics top to bottom, its left, right, top and bottom edges, and how far
// each group's top is below the column's first.
const columns = page => page.evaluate(() => {
  const found = [];
  for (const g of document.querySelectorAll('.select .group')) {
    const r = g.getBoundingClientRect();
    let column = found.find(c => Math.abs(c.left - r.left) < 0.5);
    if (!column) found.push(column = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, topics: [], tops: [] });
    column.topics.push(g.dataset.topic);
    column.tops.push(r.top - column.top);
    column.bottom = Math.max(column.bottom, r.bottom);
  }
  return found.sort((a, b) => a.left - b.left);
});
const scrolls = page => page.evaluate(() => {
  const list = document.querySelector('.select');
  return list.scrollHeight > list.clientHeight;
});
// How far Level `n`'s focus ring (2px, 4px out) is past the top and the
// foot of what the list shows (at most 0 where it shows whole).
const ringInside = (page, n) => page.evaluate(n => {
  const list = document.querySelector('.select');
  const view = list.getBoundingClientRect();
  const top = view.top + list.clientTop, bottom = top + list.clientHeight;
  const r = list.querySelector(`.row[data-level="${n}"]`).getBoundingClientRect();
  return { above: top - (r.top - 6), below: (r.bottom + 6) - bottom };
}, n);
// The list's padding as laid out, its height, and its rows' tallest column.
const listPadding = page => page.evaluate(() => {
  const list = document.querySelector('.select');
  const cs = getComputedStyle(list);
  const groups = [...list.querySelectorAll('.group')].map(g => g.getBoundingClientRect());
  return {
    top: parseFloat(cs.paddingTop), bottom: parseFloat(cs.paddingBottom), height: list.getBoundingClientRect().height,
    rows: Math.max(...groups.map(g => g.bottom)) - Math.min(...groups.map(g => g.top)),
  };
});
// The padding the list should have for `rows` px of rows in `height`: 40px
// above and 32px below where they fit (or the list scrolls); else both give
// way by the same amount, the bottom no further than 6px and the top than
// 16px, the other taking what is still needed. (The list rounds what gives
// way down to whole device pixels, so compare to within one: nearPadding.)
const nearPadding = async (page, pad, at) => {
  const dpr = await page.evaluate(() => devicePixelRatio);
  const want = wantPadding(pad.rows, pad.height);
  for (const side of ['top', 'bottom']) {
    note(`${at}: padding ${side}`, pad[side]);
    expect.soft(Math.abs(pad[side] - want[side]), `${at}: the padding ${side === 'top' ? 'above' : 'below'} (${pad[side]}, want ${want[side]})`).toBeLessThanOrEqual(1 / dpr + 0.01);
  }
  if (pad.height - pad.rows >= 22) expect.soft(pad.top + pad.bottom + pad.rows, `${at}: rows and padding within the list`).toBeLessThanOrEqual(pad.height + 0.01);
};
const wantPadding = (rows, height) => {
  const spare = height - rows;
  if (spare >= 72 || spare < 22) return { top: 40, bottom: 32 };
  let bottom = Math.max(6, 32 - (72 - spare) / 2), top = spare - bottom;
  if (top < 16) [top, bottom] = [16, spare - 16];
  return { top, bottom };
};

// Where one column is taller than the list's room, the groups flow into as
// few columns as fit, side by side, never split, read down each column then
// across; where none fits, the fewest that are as short as any, and the list
// scrolls. The room is the list's height less its padding at its least.
// Each window in a context of its own at its pixel ratio (the desktop
// project's browser, with real scrollbars).
const ONE = [['Addition', 'Subtraction', 'Multiplication', 'Division']];
const TWO = [['Addition', 'Subtraction'], ['Multiplication', 'Division']];
const THREE = [['Addition'], ['Subtraction'], ['Multiplication', 'Division']];
const SPLITS = [
  [1366, 657, 1, TWO, false],
  [1536, 730, 1.25, TWO, false],
  [1280, 610, 1.5, TWO, false],
  [1440, 900, 1, ONE, false],
  [1920, 950, 1, ONE, false],
  [1366, 400, 1, THREE, false],
  [1240, 610, 1, TWO, false],
  [1024, 620, 1, TWO, false],
  [800, 890, 1, ONE, false],
  [1920, 330, 1, THREE, true],
  [375, 812, 2, ONE, true],
  [320, 640, 2, ONE, true],
  [844, 390, 3, TWO, true],
];
test('the groups go into as many columns as it takes to fit, at each window', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'each window is a context at its own pixel ratio; the phone\'s ratio is forced by a launch flag');
  for (const [width, height, dpr, want, scrolling] of SPLITS) {
    const at = `${width}×${height}@${dpr}`;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, baseURL });
    try {
      const page = await context.newPage();
      await home(page);
      await settle(page);
      const found = await columns(page);
      expect.soft(found.map(c => c.topics), `${at}: the columns`).toEqual(want);
      expect.soft(await scrolls(page), `${at}: the list scrolls`).toBe(scrolling);
      // In the page in reading order: down each column, then across.
      const order = await page.locator('.select .group').evaluateAll(groups => groups.map(g => g.dataset.topic));
      expect.soft(order, `${at}: the groups in the page`).toEqual(want.flat());
      for (const c of found) expect.soft(c.tops, `${at}: down the column`).toEqual([...c.tops].sort((a, b) => a - b));
      // Every column as wide as the others, 32px apart, the first heading
      // of each at the list's top, below its padding; that padding as the
      // room calls for.
      const list = await rect(page, '.select');
      const pad = await listPadding(page);
      await nearPadding(page, pad, at);
      for (const c of found) {
        expect.soft(c.right - c.left, `${at}: as wide as the first column`).toBeCloseTo(found[0].right - found[0].left, 2);
        expect.soft(c.top - list.top, `${at}: each column starts at the list's top`).toBeCloseTo(pad.top, 1);
      }
      for (let i = 1; i < found.length; i++) expect.soft(found[i].left - found[i - 1].right, `${at}: column ${i} → ${i + 1}`).toBeCloseTo(32, 2);
      // The rows inside the page's sides (the gutter), as the header's text is.
      const side = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.top')).paddingLeft));
      if (found.length > 1) {
        expect.soft(found[0].left, `${at}: inside the left gutter`).toBeGreaterThanOrEqual(side - 0.01);
        expect.soft(width - found.at(-1).right, `${at}: inside the right gutter`).toBeGreaterThanOrEqual(side - 0.01);
      }
      if (!scrolling) {
        // Today's column width, the keypad's 420px less 16px each side,
        // and the whole block centred in the window.
        for (const c of found) expect.soft(c.right - c.left, `${at}: a column's width`).toBeCloseTo(388, 2);
        const mid = (found[0].left + found.at(-1).right) / 2;
        expect.soft(Math.abs(mid - width / 2), `${at}: centred`).toBeLessThanOrEqual(0.5);
      }
    } finally {
      await context.close();
    }
  }
});

// The columns' rows keep inside the page's sides, as the header's text
// does: the gutter, or the safe-area inset where it is larger. Held
// sideways at 844×390 two columns' rows (808px) fit inside 16px gutters;
// with a 47px notch each side (as landscape.spec.js has), only one does.
test('columns are allowed only where their rows fit inside the gutters or the notches', async ({ page }) => {
  await home(page);
  await resize(page, 844, 390);
  expect((await columns(page)).map(c => c.topics), 'two columns in 16px gutters').toEqual(TWO);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 47, right: 47, bottom: 21 } });
  await expect.poll(async () => (await columns(page)).length, 'one column inside 47px notches').toBe(1);
  const header = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.top')).paddingLeft));
  expect(header, 'the header keeps inside the notch').toBe(47);
  const [c] = await columns(page);
  expect(c.left, 'its rows inside the left notch').toBeGreaterThanOrEqual(47);
  expect(844 - c.right, 'and the right').toBeGreaterThanOrEqual(47);
});

// The columns are centred, so the larger side counts on both. At 880×390
// two columns' rows (808px) fit inside 16px gutters, and would inside a
// 47px notch on the left and the 16px gutter on the right (817px), but not
// once centred, 47px clear on both sides (786px): one column.
test('with a notch on one side only, the larger side counts on both', async ({ page }) => {
  await home(page);
  await resize(page, 880, 390);
  expect((await columns(page)).map(c => c.topics), 'two columns in 16px gutters').toEqual(TWO);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 47, right: 0, bottom: 0 } });
  await expect.poll(async () => (await columns(page)).length, 'one column').toBe(1);
  const header = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.top')); return [cs.paddingLeft, cs.paddingRight]; });
  expect(header, 'the header: the notch on the left, the gutter on the right').toEqual(['47px', '16px']);
  const [c] = await columns(page);
  expect(c.left, 'the rows inside the notch').toBeGreaterThanOrEqual(47);
});

// Where only the list's padding would overflow, it gives way so nothing
// scrolls (the UI review): the top and the bottom by the same amount, the
// bottom no further than 6px (a focused row's ring; or the home bar) and
// the top than 16px, the other then taking what is still needed. Where even
// that can't make room, the padding is whole and the list scrolls.
test('where only the padding would overflow, top and bottom give way alike, and the list doesn\'t scroll', async ({ page }) => {
  await home(page);
  const dpr = await page.evaluate(() => devicePixelRatio);
  const alike = (pad, at) => {
    const left = pad.height - pad.rows - pad.top - pad.bottom;
    expect(left, `${at}: the padding is what the rows leave, to a device pixel or two`).toBeGreaterThanOrEqual(-0.01);
    expect(left, `${at}: the padding is what the rows leave, to a device pixel or two`).toBeLessThan(2 / dpr + 0.01);
    expect(Math.abs((40 - pad.top) - (32 - pad.bottom)), `${at}: the top gives way as far as the bottom`).toBeLessThanOrEqual(1 / dpr + 0.01);
    expect(pad.top, `${at}: the top less than whole`).toBeLessThan(40);
  };
  // 1440×900: one column, 782px of rows in 848px.
  await resize(page, 1440, 900);
  expect((await columns(page)).map(c => c.topics), '1440×900: one column').toEqual(ONE);
  let pad = await listPadding(page);
  expect(await scrolls(page), '1440×900: the list doesn\'t scroll').toBe(false);
  alike(pad, '1440×900');
  // 1280×610: two columns, 513px of rows in 558px.
  await resize(page, 1280, 610);
  expect((await columns(page)).map(c => c.topics), '1280×610: two columns').toEqual(TWO);
  pad = await listPadding(page);
  expect(await scrolls(page), '1280×610: the list doesn\'t scroll').toBe(false);
  alike(pad, '1280×610');
  // The foot of the first column, Level 7, focused: its ring shows whole.
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await expect(levelRow(page, 7)).toBeFocused();
  const { ring, bottom, scrollTop } = await page.evaluate(() => {
    const list = document.querySelector('.select');
    const r = list.querySelector('.row[data-level="7"]').getBoundingClientRect();
    return { ring: r.bottom + 6, bottom: list.getBoundingClientRect().top + list.clientHeight, scrollTop: list.scrollTop };
  });
  expect(ring, 'Level 7\'s ring above the list\'s foot').toBeLessThanOrEqual(bottom + 0.01);
  expect(scrollTop, 'and nothing scrolled').toBe(0);
  // 600×857: 782px of rows in 805px. Alike, the top would go below 16px:
  // it stops there, and the bottom gives the rest.
  await resize(page, 600, 857);
  pad = await listPadding(page);
  expect(await scrolls(page), '600×857: the list doesn\'t scroll').toBe(false);
  expect(pad.top, '600×857: the top at its least').toBe(16);
  expect(Math.abs(pad.bottom - (pad.height - 16 - pad.rows)), '600×857: the bottom takes the rest').toBeLessThan(1 / dpr + 0.01);
  expect(pad.bottom, '600×857: no further than its own least').toBeGreaterThanOrEqual(6);
  // 375×812: 782px of rows in 764px, too many even for the least padding.
  await resize(page, 375, 812);
  pad = await listPadding(page);
  expect(await scrolls(page), '375×812: the list scrolls').toBe(true);
  expect([pad.top, pad.bottom], '375×812: its padding whole').toEqual([40, 32]);
});

// A home bar (the safe area below) is the bottom's floor: there the bottom
// gives way no further, and the top gives the rest. At 600×900 with a
// 34px home bar the bottom is 34px whole and at its least, so all of it
// comes from the top.
test('with a home bar, the bottom keeps clear of it and the top gives way instead', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom: 34 } });
  await home(page);
  await resize(page, 600, 900);
  const pad = await listPadding(page);
  expect(pad.bottom, 'the bottom at the home bar').toBe(34);
  expect(await scrolls(page), 'the list doesn\'t scroll').toBe(false);
  const dpr = await page.evaluate(() => devicePixelRatio);
  expect(Math.abs(pad.top - (pad.height - 34 - pad.rows)), 'the top gives the rest').toBeLessThan(1 / dpr + 0.01);
  expect(pad.top, 'less than its whole 40px').toBeLessThan(40);
});

// When the columns change, the focused row is shown: the browser keeps the
// scroll position, which may now leave it out of sight.
test('back from Level 5 at 1366×657, resized to 375×812 (one column), its row shows whole', async ({ page }) => {
  await home(page);
  await resize(page, 1366, 657);
  await page.evaluate(() => window.mathtime.play(window.mathtime.levels.find(level => level.n === 5)));
  await page.keyboard.press('Escape');
  await expect(levelRow(page, 5)).toBeFocused();
  await resize(page, 375, 812);
  expect((await columns(page)).length, 'one column').toBe(1);
  const { above, below } = await ringInside(page, 5);
  expect(above, 'its ring below the list\'s top').toBeLessThanOrEqual(0.01);
  expect(below, 'its ring above the list\'s foot').toBeLessThanOrEqual(0.01);
});

// A row that has the focus keeps it, and shows whole with its ring, as the
// window goes from one number of columns to another.
test('a focused row keeps the focus, and shows whole, as the window resizes across column counts', async ({ page }) => {
  await home(page);
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await expect(levelRow(page, 7)).toBeFocused();
  for (const [width, height, want] of [[1366, 657, TWO], [1366, 400, THREE], [375, 812, ONE], [844, 390, TWO], [1920, 950, ONE]]) {
    const at = `${width}×${height}`;
    await resize(page, width, height);
    expect((await columns(page)).map(c => c.topics), `${at}: the columns`).toEqual(want);
    await expect(levelRow(page, 7), `${at}: still focused`).toBeFocused();
    expect(await levelRow(page, 7).evaluate(row => row.matches(':focus-visible')), `${at}: with its ring`).toBe(true);
    const { above, below } = await ringInside(page, 7);
    expect(above, `${at}: its ring below the list's top`).toBeLessThanOrEqual(0.01);
    expect(below, `${at}: its ring above the list's foot`).toBeLessThanOrEqual(0.01);
  }
});

// Putting the groups in columns changes the list's width, which the page
// watches (main.js): the layout that follows chooses the same, so a resize
// settles after a layout or two, and nothing loops.
test('a resize across column counts settles: a layout or two, then none', async ({ page }) => {
  await home(page);
  await page.evaluate(() => {
    const { selector } = window.mathtime;
    const layout = selector.layout;
    window.selectorLayouts = 0;
    selector.layout = () => {
      window.selectorLayouts++;
      layout();
    };
  });
  for (const [width, height, want] of [[1366, 657, TWO], [1366, 400, THREE], [375, 812, ONE]]) {
    await page.evaluate(() => { window.selectorLayouts = 0; });
    await resize(page, width, height);
    expect((await columns(page)).map(c => c.topics), `${width}×${height}: the columns`).toEqual(want);
    const done = await page.evaluate(() => window.selectorLayouts);
    note(`${width}×${height}: layouts`, done, '');
    expect(done, `${width}×${height}: laid out`).toBeGreaterThan(0);
    expect(done, `${width}×${height}: a layout or two`).toBeLessThanOrEqual(3);
    await page.evaluate(() => new Promise(r => { let n = 10; const tick = () => (--n ? requestAnimationFrame(tick) : r()); requestAnimationFrame(tick); }));
    expect(await page.evaluate(() => window.selectorLayouts), `${width}×${height}: then none`).toBe(done);
  }
});

// In two columns (1366×657), Tab still goes through the rows as shown,
// down the first column and then the second, and back.
test('in two columns, Tab and Shift+Tab go down the first column, then the second, and back', async ({ page }) => {
  await home(page);
  await resize(page, 1366, 657);
  const found = await columns(page);
  expect(found.map(c => c.topics), 'two columns').toEqual(TWO);
  const left = async n => (await levelRow(page, n).boundingBox()).x;
  expect(await left(4), 'Level 4 in the second column').toBeGreaterThan(found[0].right);
  expect(await left(7), 'Level 7 in the first').toBeLessThan(found[0].right);
  for (const n of SHOWN) {
    await page.keyboard.press('Tab');
    await expect(levelRow(page, n)).toBeFocused();
  }
  for (const n of SHOWN.slice(0, -1).reverse()) {
    await page.keyboard.press('Shift+Tab');
    await expect(levelRow(page, n)).toBeFocused();
  }
});

// At 900×320 the list is two columns and still scrolls: Level 5, the last
// row of the second column, is below the fold. Back from it, the list
// scrolls down just far enough to show its row and its ring, and only down.
test('back from Level 5, at the foot of the second column, the list scrolls just far enough to show its row and ring', async ({ page }) => {
  const RING = 6;                                         // 2px, 4px out
  // Chosen through the game's handle, so the list is unscrolled when it
  // comes back: a click on the row would scroll it into view first.
  await home(page);
  await resize(page, 900, 320);
  await page.evaluate(() => window.mathtime.play(window.mathtime.levels.find(level => level.n === 5)));
  await expect(page.locator('.crumbs .here')).toHaveText('Division 1');
  await page.keyboard.press('Escape');
  await expect(levelRow(page, 5)).toBeFocused();
  await expect(levelRow(page, 5)).toHaveClass(/\bcurrent\b/);
  const found = await columns(page);
  expect(found.map(c => c.topics), 'two columns').toEqual(TWO);
  const { row, view, scrolled } = await page.evaluate(() => {
    const list = document.querySelector('.select');
    const box = list.getBoundingClientRect();
    const r = list.querySelector('.row[data-level="5"]').getBoundingClientRect();
    const top = box.top + list.clientTop, left = box.left + list.clientLeft;
    return {
      row: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      view: { top, bottom: top + list.clientHeight, left, right: left + list.clientWidth, scrollTop: list.scrollTop, scrollLeft: list.scrollLeft },
      scrolled: [document.documentElement.scrollTop, document.body.scrollTop],
    };
  });
  expect(row.left, 'Level 5 in the second column').toBeGreaterThan(found[0].right);
  expect(view.scrollTop, 'the row was below the fold, so the list scrolled').toBeGreaterThan(0);
  expect(view.scrollLeft, 'and never sideways').toBe(0);
  expect(row.top - RING, 'ring top').toBeGreaterThanOrEqual(view.top - 0.01);
  expect(row.bottom + RING, 'ring bottom').toBeLessThanOrEqual(view.bottom + 0.01);
  expect(row.left - RING, 'ring left').toBeGreaterThanOrEqual(view.left - 0.01);
  expect(row.right + RING, 'ring right').toBeLessThanOrEqual(view.right + 0.01);
  expect(view.bottom - (row.bottom + RING), 'scrolled just far enough').toBeLessThan(1);
  expect(scrolled, 'the page itself never scrolls').toEqual([0, 0]);
});

test('the level you came from has no bar: it is marked only for screen readers and the focus', async ({ page }) => {
  await home(page);
  await page.evaluate(() => document.querySelector('.select .row[data-level="1"]').classList.add('current'));
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('.select .row[data-level="1"]'), '::before').content);
  expect(before).toBe('none');
});

test('rows are 80px tall with the key ring and 24px padding; pressed, they take the key-press fill', async ({ page }) => {
  await home(page);
  const row = levelRow(page, 1);
  await expect(row).toHaveCSS('height', '80px');
  await expect(row).toHaveCSS('padding-left', '24px');
  await expect(row).toHaveCSS('padding-right', '24px');
  await expect(row).toHaveCSS('box-shadow', 'rgba(238, 245, 255, 0.8) 0px 0px 0px 1.5px inset');
  const box = await row.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await expect(row).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.12)');
  await page.mouse.up();
});

test('the type is set as the spec says', async ({ page }) => {
  await home(page);
  const heading = page.locator('.select .group-name').first();
  await expect(heading).toHaveCSS('font-size', '12px');
  await expect(heading).toHaveCSS('font-weight', '500');
  await expect(heading).toHaveCSS('letter-spacing', '1.2px');
  await expect(heading).toHaveCSS('text-transform', 'uppercase');
  await expect(heading).toHaveCSS('color', 'rgb(182, 205, 238)');
  const row = levelRow(page, 1);
  await expect(row.locator('.title')).toHaveCSS('font-size', '17px');
  await expect(row.locator('.title')).toHaveCSS('font-weight', '600');
  await expect(row.locator('.name')).toHaveCSS('font-size', '13px');
  await expect(row.locator('.name')).toHaveCSS('color', 'rgb(182, 205, 238)');
  await expect(row.locator('.sample')).toHaveCSS('font-size', '30px');
  await expect(row.locator('.sample')).toHaveCSS('font-weight', '500');
  await expect(row.locator('.sample .op')).toHaveCSS('color', 'rgb(182, 205, 238)');
});

// The text boxes are trimmed to the capitals and the baseline, so these
// layout distances are ink distances too (pixels: Task 5's tests). In
// columns (the ink tests below measure them at 1366×657), each column's
// first heading is 40px below the header, and topics are 32px apart within
// a column. The 40px is the list's top padding, which gives way where the
// rows only just fit (1440×900: about 37px; the padding tests check it).
test('the list starts 40px below the header, headings 14px above their rows, topics 32px apart', async ({ page }) => {
  await home(page);
  const header = await rect(page, '.top');
  const groups = await page.locator('.select .group').count();
  expect(groups, 'every topic').toBe(4);
  const pad = await listPadding(page);
  await nearPadding(page, pad, 'the list');
  const top = pad.top;
  expect((await rect(page, '.select .group-name', 0)).top - header.bottom).toBeCloseTo(top, 1);
  for (let g = 0; g < groups; g++) {
    const heading = await rect(page, '.select .group-name', g);
    const first = await rect(page, `.select .group:nth-child(${g + 1}) .row`);
    expect(first.top - heading.bottom, `topic ${g + 1}: heading → row`).toBeCloseTo(14, 1);
    if (g === 0) continue;
    const before = await page.evaluate(g => {
      const [prev, group] = [...document.querySelectorAll('.select .group')].slice(g - 1, g + 1).map(el => el.getBoundingClientRect());
      return Math.abs(prev.left - group.left) < 0.5 ? document.querySelectorAll('.select .group')[g - 1].lastElementChild.getBoundingClientRect().bottom : null;
    }, g);
    if (before === null) expect(heading.top - header.bottom, `topic ${g + 1}, the first in its column`).toBeCloseTo(top, 1);
    else expect(heading.top - before, `topic ${g}'s last row → topic ${g + 1}`).toBeCloseTo(32, 1);
  }
});

// One column, or each of the columns, is the keypad's width less the
// list's 16px padding, the columns 32px apart, and the list centred.
test('the column is as wide as the keypad, centred; in columns, each is, 32px apart', async ({ page }) => {
  await home(page);
  const width = await page.evaluate(() => innerWidth);
  const column = await rect(page, '.select');
  const found = await columns(page);
  const n = found.length;
  expect(column.width).toBe(Math.min(n * 388 + (n - 1) * 32 + 32, width));
  expect(Math.abs(column.left + column.width / 2 - width / 2)).toBeLessThanOrEqual(0.5);
  const row = await rect(page, '.select .row', 0);
  expect(row.left - column.left).toBe(16);
  expect(column.right - found.at(-1).right).toBe(16);
  for (let i = 1; i < n; i++) expect(found[i].left - found[i - 1].right, `column ${i} → ${i + 1}`).toBe(32);
});

// ---------- On its ink (Level 2 spec §5, finished-mark spec §1) ----------

// Runs kept before the page loads, as the finish screen keeps them.
const keptBefore = (page, records) => page.addInitScript(r => localStorage.setItem('mathtime.runs', JSON.stringify(r)), records);
const earlier = (level, totalMs) => ({
  id: `earlier-${level}-${totalMs}`, level, finishedAt: '2026-11-01T09:30:00.000Z', totalMs, misses: 0, problems: [],
});
const rows = page => page.locator('.select .row').count();

// Each placed text starts on a whole device pixel, so its ink is within
// half of one of its edge, as the breadcrumb's is. Two such texts can be a
// whole device pixel apart: at 1x, where small text is drawn on whole
// pixels, that is the floor (Level 1 spec §6.2).
const onEdge = async page => 0.5 / await page.evaluate(() => devicePixelRatio) + 0.05;
const apart = async page => 1 / await page.evaluate(() => devicePixelRatio) + 0.05;

// Row `i`'s ink, from the real pixels of `shot`:
// - title, name: the text block's two lines;
// - cap: the "L" of "Level N", whose top is the capitals';
// - base: the name's first letter, whose foot is the baseline;
// - sample, digits, op: an unfinished row's sample whole, its digits and
//   its operator (unset on a finished row, whose sample is hidden);
// - tick, best: a finished row's check and time (unset on the others).
// The areas keep clear of the key ring, and split the
// text block in its 10px gap: muted ink counts as ink against the brighter
// colour, and white as ink against the green.
async function rowInk(page, shot, i) {
  const row = await rect(page, '.select .row', i);
  const title = await rect(page, '.select .title', i);
  const name = await rect(page, '.select .name', i);
  const parts = await page.evaluate(i => {
    const row = document.querySelectorAll('.select .row')[i];
    const box = el => {
      if (!el.getClientRects().length) return null;          // hidden
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    return {
      sample: [...row.querySelector('.sample').children].map(box),
      tick: box(row.querySelector('.tick')),
      best: box(row.querySelector('.best')),
    };
  }, i);
  const top = row.top + 4, bottom = row.bottom - 4, split = (title.bottom + name.top) / 2;
  const found = {
    row,
    title: ink(shot, { left: row.left + 8, right: title.right + 4, top, bottom: split }),
    name: ink(shot, { left: row.left + 8, right: name.right + 4, top: split, bottom }, MUTED),
    cap: ink(shot, { left: title.left - 2, right: title.left + 0.55 * 17, top, bottom: split }),
    base: ink(shot, { left: name.left - 2, right: name.left + 0.55 * 13, top: split, bottom }, MUTED),
  };
  const [first, op, last] = parts.sample;
  if (first) {
    const a = ink(shot, { ...first, top, bottom }), b = ink(shot, { ...last, top, bottom });
    found.sample = ink(shot, { left: first.left - 4, right: Math.min(last.right + 4, row.right - 4), top, bottom });
    found.digits = { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
    found.op = ink(shot, { ...op, top, bottom }, MUTED);
  }
  if (parts.tick) found.tick = ink(shot, { left: parts.tick.left - 4, right: row.right - 4, top, bottom: split }, GOOD);
  if (parts.best) found.best = ink(shot, { left: parts.best.left - 4, right: row.right - 4, top: split, bottom });
  return found;
}

// A screenshot with the `i`th `selector` in the list's view, 8px around it
// too (a row's key ring). At 320×640 the rows run past the fold, so
// the list is scrolled as little as it takes, by whole pixels only: what
// moves stays on the device-pixel grid the selector's layout put it on.
async function shotWith(page, selector, i) {
  await page.evaluate(([sel, i]) => {
    const list = document.querySelector('.select');
    const r = list.querySelectorAll(sel)[i].getBoundingClientRect();
    const box = list.getBoundingClientRect();
    const top = box.top + list.clientTop, bottom = top + list.clientHeight;
    if (r.bottom + 8 > bottom) list.scrollTop += Math.ceil(r.bottom + 8 - bottom);
    else if (r.top - 8 < top) list.scrollTop -= Math.ceil(top - (r.top - 8));
  }, [selector, i]);
  return capture(page);
}

// Each also at 320×640, where the samples are set at 22px (the narrow
// rules), and at 1366×657, in two columns: every column is on its ink.
for (const size of [null, [320, 640], [1366, 657]]) test.describe(size ? `ink alignment, ${size.join('×')}` : 'ink alignment', () => {
  test.beforeEach(async ({ page }) => {
    await home(page);
    await freeze(page);
    if (size) await resize(page, ...size);
    if (size?.[0] === 1366) expect((await columns(page)).map(c => c.topics), 'two columns').toEqual(TWO);
  });

  test('row text starts on its ink at the left padding edge, headings at the column\'s', async ({ page }) => {
    const near = await onEdge(page);
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, await shotWith(page, '.select .row', i), i);
      note(`row ${i + 1} title from the padding edge`, p.title.left - (p.row.left + 24));
      expect(Math.abs(p.title.left - (p.row.left + 24)), `row ${i + 1} title`).toBeLessThanOrEqual(near);
      expect(Math.abs(p.name.left - (p.row.left + 24)), `row ${i + 1} name`).toBeLessThanOrEqual(near);
    }
    // A heading at its own column's edge: its group's left, which its rows
    // share (in one column, the list's padding edge). Read from that
    // column alone, so another column's ink can't stand in for it.
    for (let i = 0; i < await page.locator('.select .group-name').count(); i++) {
      const shot = await shotWith(page, '.select .group-name', i);
      const h = await rect(page, '.select .group-name', i);
      const edge = (await rect(page, '.select .group', i)).left;
      const heading = ink(shot, { left: edge - 12, right: h.right + 4, top: h.top - 4, bottom: h.bottom + 4 }, MUTED);
      expect(Math.abs(heading.left - edge), `heading ${i + 1}`).toBeLessThanOrEqual(near);
    }
  });

  // The samples line up down each column (in columns, each has its own edge).
  test('each sample ends on its ink at the right padding edge, so the samples line up', async ({ page }) => {
    const [near, together] = [await onEdge(page), await apart(page)];
    const rights = new Map();                             // a column's left edge → its samples' right ink
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, await shotWith(page, '.select .row', i), i);
      note(`row ${i + 1} sample from the padding edge`, p.sample.right - (p.row.right - 24));
      expect(Math.abs(p.sample.right - (p.row.right - 24)), `row ${i + 1}`).toBeLessThanOrEqual(near);
      const column = Math.round(p.row.left);
      rights.set(column, [...(rights.get(column) ?? []), p.sample.right]);
    }
    for (const [column, right] of rights) {
      note(`samples' right ink, spread, the column at ${column}px`, Math.max(...right) - Math.min(...right));
      expect(Math.max(...right) - Math.min(...right), `the column at ${column}px`).toBeLessThanOrEqual(together);
    }
  });

  test('the two inner margins match', async ({ page }) => {
    const together = await apart(page);
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, await shotWith(page, '.select .row', i), i);
      const left = p.title.left - p.row.left, right = p.row.right - p.sample.right;
      note(`row ${i + 1} margins, right less left`, right - left);
      expect(Math.abs(right - left), `row ${i + 1}: left ${left.toFixed(3)}, right ${right.toFixed(3)}`).toBeLessThanOrEqual(together);
    }
  });

  test('each sample\'s operator is centred on its digits\' ink', async ({ page }) => {
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, await shotWith(page, '.select .row', i), i);
      const off = (p.op.top + p.op.bottom) / 2 - (p.digits.top + p.digits.bottom) / 2;
      note(`row ${i + 1} operator`, off);
      expect(Math.abs(off), `row ${i + 1}`).toBeLessThanOrEqual(TOL);
    }
  });

  // The text block runs from the capitals' top of "Level N" to the name's
  // baseline (the review's measure: descenders hang outside it).
  test('the sample and the text block are each centred in their row', async ({ page }) => {
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, await shotWith(page, '.select .row', i), i);
      const mid = p.row.top + p.row.height / 2;
      const sample = (p.digits.top + p.digits.bottom) / 2 - mid;
      const text = (p.cap.top + p.base.bottom) / 2 - mid;
      note(`row ${i + 1} sample from centre`, sample);
      note(`row ${i + 1} text from centre`, text);
      expect(Math.abs(sample), `row ${i + 1} sample`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(text), `row ${i + 1} text`).toBeLessThanOrEqual(TOL);
    }
  });

  // The headings are not moved down onto whole pixels: at 1x a heading's
  // ink can start most of a pixel from its box (the second one's box starts
  // at .375, its ink on the next whole pixel), so the floor is 1x's.
  // In columns, each column's first heading is 40px from the header, and
  // the gaps between topics are within a column. The 40px is the list's top
  // padding, less what it gives way where the rows only just fit.
  test('ink to edge: 40px from the header, 14px from a heading to its row, 32px between topics', async ({ page }) => {
    const near = Math.max(TOL, await apart(page));
    const header = await rect(page, '.top');
    const { top } = await listPadding(page);
    // Every topic's heading, with its first row and the row before it (the
    // last of the topic above, in the same column), each scrolled into view
    // where the list runs past the fold (at 320×640), the first at the
    // list's top. Each read from its own column alone.
    const count = await page.locator('.select .group').count();
    expect(count, 'every topic').toBe(4);
    const checks = [];
    for (let i = 0; i < count; i++) {
      const shot = await shotWith(page, '.select .group', i);
      const { edge, h, first, before, scrolled } = await page.evaluate(i => {
        const g = document.querySelectorAll('.select .group')[i];
        const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
        const prev = g.previousElementSibling;
        const sameColumn = prev && Math.abs(prev.getBoundingClientRect().left - g.getBoundingClientRect().left) < 0.5;
        return {
          edge: g.getBoundingClientRect().left, h: box(g.querySelector('.group-name')), first: box(g.querySelector('.row')),
          before: sameColumn ? box(prev.lastElementChild) : null, scrolled: document.querySelector('.select').scrollTop,
        };
      }, i);
      const heading = ink(shot, { left: edge - 12, right: h.right + 4, top: h.top - 4, bottom: h.bottom + 4 }, MUTED);
      if (!before) checks.push([`header → topic ${i + 1}, the first in its column`, heading.top + scrolled - header.bottom, top, TOL]);
      else checks.push([`topic ${i}'s last row → topic ${i + 1}`, heading.top - before.bottom, 32, near]);
      checks.push([`topic ${i + 1}: heading → row`, first.top - heading.bottom, 14, TOL]);
    }
    for (const [name, gap, want, tol] of checks) {
      note(name, gap);
      expect(Math.abs(gap - want), name).toBeLessThanOrEqual(tol);
    }
  });

  for (const width of [1440, 360]) test(`on the selector the breadcrumb's ink starts at the header's edge, ${width}px wide`, async ({ page }) => {
    await resize(page, width, 800);
    const crumbs = ink(await capture(page), await rect(page, '.crumbs'), MUTED);
    const edge = await rect(page, '.where');
    note('crumbs ink right of the edge', crumbs.left - edge.left);
    expect(Math.abs(crumbs.left - edge.left)).toBeLessThanOrEqual(await onEdge(page));
  });

  test('a new width lays the selector out again', async ({ page }) => {
    await resize(page, 360, 700);
    const near = await onEdge(page);
    const p = await rowInk(page, await capture(page), 1);
    expect(Math.abs(p.title.left - (p.row.left + 24)), 'title').toBeLessThanOrEqual(near);
    expect(Math.abs(p.sample.right - (p.row.right - 24)), 'sample').toBeLessThanOrEqual(near);
  });

  test('laying the selector out again moves nothing', async ({ page }) => {
    const placed = () => page.evaluate(() => [...document.querySelectorAll('.select .group-name, .select .title, .select .name, .select .sample, .select .sample .op, .select .best')]
      .map(el => [el.style.marginLeft, el.style.left, el.style.top, el.style.getPropertyValue('--ink-dx'), el.style.getPropertyValue('--ink-dy')].join('|')));
    const before = await placed();
    expect(before.some(s => s.replace(/\|/g, '')), 'something was placed').toBe(true);
    await page.evaluate(() => {
      window.mathtime.selector.layout();
      window.mathtime.selector.layout();
    });
    expect(await placed()).toEqual(before);
  });

  // A scrollbar in the list (a short desktop window) narrows its rows
  // without resizing the window or the header, so the list's own size is
  // watched too. (The phone project hides scrollbars: padding stands in,
  // the same in both projects.)
  test('the list narrowing on its own lays the selector out again', async ({ page }) => {
    await page.evaluate(() => {
      const { selector } = window.mathtime;
      const layout = selector.layout;
      window.selectorLayouts = 0;
      selector.layout = () => {
        window.selectorLayouts++;
        layout();
      };
    });
    await page.addStyleTag({ content: '.select { padding-right: 33px !important; }' });   // 17px narrower
    await expect.poll(() => page.evaluate(() => window.selectorLayouts)).toBeGreaterThan(0);
    const p = await rowInk(page, await capture(page), 0);
    expect(Math.abs(p.sample.right - (p.row.right - 24))).toBeLessThanOrEqual(await onEdge(page));
  });
});

// Below 360px wide the samples are set at 24px, not 30px (the Levels 3–5
// mockup), so a name keeps a clear gap to its sample: at 30px "Subtraction
// past 10" touched "13 − 5" at 320. Below 340px they are one step smaller
// again, 22px (the Levels 6–7 UI review): at 24px "Column subtraction"
// came within about 11px of "52 − 27" at 320, where the other rows kept
// 15px or more. Every row's sample changes alike, so they still line up.
// Each is measured with the other hidden (hidden text keeps its place), so
// a touching name and sample cannot pass for one: the sample with the text
// block hidden, the name with the sample.
// This test stands for phones at 340 and 320, whose overlay scrollbars take
// no room. So the desktop project, whose real scrollbars do, emulates a
// phone here: the list's scrollbar is hidden, as the phone project's are.
// (A desktop window can be this narrow too, at 400% zoom, where the list's
// 8px scrollbar does take room from the rows; that is not this case.)
test('below 360px the samples are 24px, below 340px 22px, and every row\'s name keeps 15px clear of its sample at 340 and 320', async ({ page }) => {
  await home(page);
  await freeze(page);
  if (test.info().project.name === 'desktop') await page.addStyleTag({ content: '.select { scrollbar-width: none !important; }' });
  const n = await rows(page);
  const sizes = async px => {
    for (let i = 1; i <= n; i++) await expect(levelRow(page, i).locator('.sample')).toHaveCSS('font-size', px);
  };
  const hide = sel => page.addStyleTag({ content: `${sel} { visibility: hidden !important; }` });
  // Row by row, each scrolled into view: the rows run past the fold.
  async function gaps(width) {
    for (let i = 0; i < n; i++) {
      await shotWith(page, '.select .row', i);
      const row = await rect(page, '.select .row', i);
      const [title, name] = [await rect(page, '.select .title', i), await rect(page, '.select .name', i)];
      // Clear of the key ring; the name's half below the text block's gap.
      const whole = { left: row.left + 8, right: row.right - 8, top: row.top + 4, bottom: row.bottom - 4 };
      const lower = { left: row.left + 8, right: row.right - 8, top: (title.bottom + name.top) / 2, bottom: row.bottom - 4 };
      const texts = await hide('.select .title, .select .name');
      const sample = ink(await capture(page), whole);
      await texts.evaluate(tag => tag.remove());
      const samples = await hide('.select .sample');
      const nameInk = ink(await capture(page), lower, MUTED);
      await samples.evaluate(tag => tag.remove());
      const level = await page.locator('.select .row').nth(i).getAttribute('data-level');
      note(`${width}px, Level ${level} name → sample`, sample.left - nameInk.right);
      expect(sample.left - nameInk.right, `${width}px, Level ${level}: name → sample`).toBeGreaterThanOrEqual(15);
    }
  }
  await resize(page, 360, 640);
  await sizes('30px');
  await resize(page, 359, 640);
  await sizes('24px');
  await resize(page, 340, 640);
  await sizes('24px');
  await gaps(340);
  await resize(page, 339, 640);
  await sizes('22px');
  await resize(page, 320, 640);
  await sizes('22px');
  await gaps(320);
});

// Levels 6 and 7 finished: their rows show the check and their best times,
// and say so, as the others do.
test('Levels 6 and 7, finished, show their check and best time, and are named with it', async ({ page }) => {
  await keptBefore(page, [earlier(6, 214_500), earlier(6, 199_900), earlier(7, 238_200)]);
  await home(page);
  for (const [n, name, time] of [[6, 'Addition, Level 2: Column addition', '3:19.9'], [7, 'Subtraction, Level 3: Column subtraction', '3:58.2']]) {
    await expect(levelRow(page, n)).toHaveClass(/\bfinished\b/);
    await expect(levelRow(page, n).locator('.tick')).toBeVisible();
    await expect(levelRow(page, n).locator('.sample')).toBeHidden();
    await expect(levelRow(page, n).locator('.best')).toHaveText(time);
    await expect(levelRow(page, n)).toHaveAttribute('aria-label', `${name}. Finished, best ${time}.`);
  }
  for (const n of [1, 2, 3, 4, 5]) await expect(levelRow(page, n)).not.toHaveClass(/\bfinished\b/);
});

for (const size of [null, [1366, 657]]) test.describe(size ? `ink alignment, finished rows, ${size.join('×')}` : 'ink alignment, finished rows', () => {
  test.beforeEach(async ({ page }) => {
    await keptBefore(page, LEVELS.map(level => earlier(level.n, 72_400 + 11_100 * level.n)));
    await home(page);
    await freeze(page);
    if (size) await resize(page, ...size);
    if (size?.[0] === 1366) expect((await columns(page)).map(c => c.topics), 'two columns').toEqual(TWO);
  });

  // The check's viewBox is cropped to its ink, so its box, at the padding,
  // is its ink there. The time is moved onto its ink, as the text is.
  test('a finished row\'s check and time end on their ink at the right padding edge, and its margins match', async ({ page }) => {
    const [near, together] = [await onEdge(page), await apart(page)];
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, await shotWith(page, '.select .row', i), i);
      const edge = p.row.right - 24;
      note(`row ${i + 1} check from the padding edge`, p.tick.right - edge);
      note(`row ${i + 1} time from the padding edge`, p.best.right - edge);
      expect(Math.abs(p.tick.right - edge), `row ${i + 1} check`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(p.best.right - edge), `row ${i + 1} time`).toBeLessThanOrEqual(near);
      const left = p.title.left - p.row.left, right = p.row.right - p.best.right;
      expect(Math.abs(right - left), `row ${i + 1}: left ${left.toFixed(3)}, right ${right.toFixed(3)}`).toBeLessThanOrEqual(together);
    }
  });
});

// Two rows in one group (Level 3 spec §3): 12px apart, the finish buttons'
// gap, so a focused row's ring (2px, 4px out) stays 6px clear of the next.
test('rows in a group are 12px apart, and a focused row\'s ring stays 6px clear of the next', async ({ page }) => {
  await home(page);
  await freeze(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');   // 1, 6, then 2
  await expect(levelRow(page, 2)).toBeFocused();
  const [upper, lower] = [await rect(page, '.select .row[data-level="2"]'), await rect(page, '.select .row[data-level="3"]')];
  note('row to row', lower.top - upper.bottom);
  expect(lower.top - upper.bottom, 'row to row').toBeCloseTo(12, 1);
  // From pixels: the focus ring below Level 2, then Level 3's key ring.
  const shot = await capture(page);
  const across = { left: upper.left + 40, right: upper.right - 40 };
  const ring = ink(shot, { ...across, top: upper.bottom + 1, bottom: upper.bottom + 9 });
  const next = ink(shot, { ...across, top: upper.bottom + 9, bottom: lower.top + 4 });
  note('focus ring to the next row', next.top - ring.bottom);
  expect(Math.abs(ring.bottom - (upper.bottom + 6)), 'the ring ends 6px out').toBeLessThanOrEqual(TOL);
  expect(Math.abs(next.top - ring.bottom - 6), 'then 6px clear').toBeLessThanOrEqual(TOL);
});
