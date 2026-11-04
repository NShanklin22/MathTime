import { test, expect } from '@playwright/test';
import { open, levelRow, setProblem, rect, resize, capture, ink, freeze, note, typeKeys, TOL, MUTED, GOOD } from './helpers.js';
import { LEVELS } from '../../src/levels.js';

// The level selector (Level 2 spec §3).

// Load the game as it opens: on the selector.
async function home(page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
}

test('the game opens on the selector: the built levels by topic, nothing marked', async ({ page }) => {
  await home(page);
  await expect(page.locator('.select')).toBeVisible();
  for (const hidden of ['.stage', '.pad', '.lives']) await expect(page.locator(hidden)).toBeHidden();
  // A landmark of its own: the only <main> is the hidden problem area.
  const list = page.getByRole('region', { name: 'Levels' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('button')).toHaveCount(2);
  await expect(page.locator('#status')).toBeEmpty();   // no problem yet, so nothing announced
  await expect(page.locator('.select .group-name')).toHaveText(['Addition', 'Subtraction']);
  await expect(page.locator('.select .group')).toHaveCount(2);
  await expect(page.locator('.select .group').nth(0).locator('.row')).toHaveAttribute('data-level', '1');
  await expect(page.locator('.select .group').nth(1).locator('.row')).toHaveAttribute('data-level', '2');
  await expect(page.getByRole('button', { name: 'Level 1: Single-digit addition' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Level 2: Subtraction within 10' })).toBeVisible();
  await expect(levelRow(page, 1).locator('.title')).toHaveText('Level 1');
  await expect(levelRow(page, 1).locator('.name')).toHaveText('Single-digit addition');
  await expect(levelRow(page, 1).locator('.sample')).toHaveText('3+4');
  await expect(levelRow(page, 2).locator('.sample')).toHaveText('7−3');
  await expect(levelRow(page, 1).locator('.sample')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.select .row.current')).toHaveCount(0);
  await expect(page.locator('.select .row[aria-current]')).toHaveCount(0);
});

test('on the selector the breadcrumb is "Levels" alone', async ({ page }) => {
  await home(page);
  await expect(page.locator('.crumbs .home')).toHaveText('Levels');
  await expect(page.locator('.crumbs .home')).toHaveAttribute('aria-current', 'page');
  for (const crumb of ['.back', '.topic', '.here', '.sep']) await expect(page.locator(`.crumbs ${crumb}`).first()).toBeHidden();
});

for (const n of [1, 2]) test(`choosing Level ${n} starts it at question 1 with 3 lives, focus on the answer`, async ({ page }) => {
  await home(page);
  await levelRow(page, n).click();
  await expect(page.locator('.select')).toBeHidden();
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await expect(page.locator('#ans')).toBeFocused();
  await expect(page.locator('.crumbs .here')).toHaveText(`Level ${n}`);
  await expect(page.locator('.crumbs .home')).toBeHidden();
  await expect(page.locator('#status')).toHaveText(new RegExp(`^Question 1 of 20: \\d ${n === 1 ? 'plus' : 'minus'} \\d$`));
});

test('the rows are buttons in the tab order', async ({ page }) => {
  await home(page);
  await page.keyboard.press('Tab');
  await expect(levelRow(page, 1)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(levelRow(page, 2)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.crumbs .here')).toHaveText('Level 2');
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
  await expect(page.locator('.crumbs .here')).toHaveText('Level 1');
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

test('the level you came from has a 4px amber bar on its left edge', async ({ page }) => {
  await home(page);
  await page.evaluate(() => document.querySelector('.select .row[data-level="1"]').classList.add('current'));
  const bar = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.select .row[data-level="1"]'), '::before');
    return { width: cs.width, color: cs.backgroundColor, left: cs.left, top: cs.top, bottom: cs.bottom };
  });
  expect(bar).toEqual({ width: '4px', color: 'rgb(255, 214, 107)', left: '0px', top: '0px', bottom: '0px' });
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
// layout distances are ink distances too (pixels: Task 5's tests).
test('the list starts 40px below the header, headings 14px above their rows, topics 32px apart', async ({ page }) => {
  await home(page);
  const header = await rect(page, '.top');
  const [h1, h2] = [await rect(page, '.select .group-name', 0), await rect(page, '.select .group-name', 1)];
  const [r1, r2] = [await rect(page, '.select .row', 0), await rect(page, '.select .row', 1)];
  expect(h1.top - header.bottom).toBeCloseTo(40, 1);
  expect(r1.top - h1.bottom).toBeCloseTo(14, 1);
  expect(h2.top - r1.bottom).toBeCloseTo(32, 1);
  expect(r2.top - h2.bottom).toBeCloseTo(14, 1);
});

test('the column is as wide as the keypad, centred', async ({ page }) => {
  await home(page);
  const width = await page.evaluate(() => innerWidth);
  const column = await rect(page, '.select');
  expect(column.width).toBe(Math.min(420, width));
  expect(Math.abs(column.left + column.width / 2 - width / 2)).toBeLessThanOrEqual(0.5);
  const row = await rect(page, '.select .row', 0);
  expect(row.left - column.left).toBe(16);
  expect(column.right - row.right).toBe(16);
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
// The areas keep clear of the key ring and the amber bar, and split the
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

test.describe('ink alignment', () => {
  test.beforeEach(async ({ page }) => {
    await home(page);
    await freeze(page);
  });

  test('row text starts on its ink at the left padding edge, headings at the column\'s', async ({ page }) => {
    const near = await onEdge(page);
    const shot = await capture(page);
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, shot, i);
      note(`row ${i + 1} title from the padding edge`, p.title.left - (p.row.left + 24));
      expect(Math.abs(p.title.left - (p.row.left + 24)), `row ${i + 1} title`).toBeLessThanOrEqual(near);
      expect(Math.abs(p.name.left - (p.row.left + 24)), `row ${i + 1} name`).toBeLessThanOrEqual(near);
    }
    const column = await rect(page, '.select');
    for (let i = 0; i < await page.locator('.select .group-name').count(); i++) {
      const h = await rect(page, '.select .group-name', i);
      const heading = ink(shot, { left: column.left + 4, right: h.right + 4, top: h.top - 4, bottom: h.bottom + 4 }, MUTED);
      expect(Math.abs(heading.left - (column.left + 16)), `heading ${i + 1}`).toBeLessThanOrEqual(near);
    }
  });

  test('each sample ends on its ink at the right padding edge, so the samples line up', async ({ page }) => {
    const [near, together] = [await onEdge(page), await apart(page)];
    const shot = await capture(page);
    const rights = [];
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, shot, i);
      note(`row ${i + 1} sample from the padding edge`, p.sample.right - (p.row.right - 24));
      expect(Math.abs(p.sample.right - (p.row.right - 24)), `row ${i + 1}`).toBeLessThanOrEqual(near);
      rights.push(p.sample.right);
    }
    note('samples\' right ink, spread', Math.max(...rights) - Math.min(...rights));
    expect(Math.max(...rights) - Math.min(...rights)).toBeLessThanOrEqual(together);
  });

  test('the two inner margins match', async ({ page }) => {
    const together = await apart(page);
    const shot = await capture(page);
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, shot, i);
      const left = p.title.left - p.row.left, right = p.row.right - p.sample.right;
      note(`row ${i + 1} margins, right less left`, right - left);
      expect(Math.abs(right - left), `row ${i + 1}: left ${left.toFixed(3)}, right ${right.toFixed(3)}`).toBeLessThanOrEqual(together);
    }
  });

  test('each sample\'s operator is centred on its digits\' ink', async ({ page }) => {
    const shot = await capture(page);
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, shot, i);
      const off = (p.op.top + p.op.bottom) / 2 - (p.digits.top + p.digits.bottom) / 2;
      note(`row ${i + 1} operator`, off);
      expect(Math.abs(off), `row ${i + 1}`).toBeLessThanOrEqual(TOL);
    }
  });

  // The text block runs from the capitals' top of "Level N" to the name's
  // baseline (the review's measure: descenders hang outside it).
  test('the sample and the text block are each centred in their row', async ({ page }) => {
    const shot = await capture(page);
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, shot, i);
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
  test('ink to edge: 40px from the header, 14px from a heading to its row, 32px between topics', async ({ page }) => {
    const near = Math.max(TOL, await apart(page));
    const shot = await capture(page);
    const column = await rect(page, '.select');
    const header = await rect(page, '.top');
    const headings = [];
    for (const i of [0, 1]) {
      const h = await rect(page, '.select .group-name', i);
      headings.push(ink(shot, { left: column.left + 4, right: h.right + 4, top: h.top - 4, bottom: h.bottom + 4 }, MUTED));
    }
    const [r1, r2] = [await rect(page, '.select .row', 0), await rect(page, '.select .row', 1)];
    for (const [name, gap, want] of [
      ['header → first heading', headings[0].top - header.bottom, 40],
      ['heading → row', r1.top - headings[0].bottom, 14],
      ['row → next heading', headings[1].top - r1.bottom, 32],
      ['next heading → its row', r2.top - headings[1].bottom, 14],
    ]) {
      note(name, gap);
      expect(Math.abs(gap - want), name).toBeLessThanOrEqual(near);
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
  // watched too. (Headless Chromium hides scrollbars: padding stands in.)
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

test.describe('ink alignment, finished rows', () => {
  test.beforeEach(async ({ page }) => {
    await keptBefore(page, LEVELS.map(level => earlier(level.n, 72_400 + 11_100 * level.n)));
    await home(page);
    await freeze(page);
  });

  // The check's viewBox is cropped to its ink, so its box, at the padding,
  // is its ink there. The time is moved onto its ink, as the text is.
  test('a finished row\'s check and time end on their ink at the right padding edge, and its margins match', async ({ page }) => {
    const [near, together] = [await onEdge(page), await apart(page)];
    const shot = await capture(page);
    for (let i = 0; i < await rows(page); i++) {
      const p = await rowInk(page, shot, i);
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
