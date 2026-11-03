import { test, expect } from '@playwright/test';
import {
  open, levelRow, freeze, playTo, answer, finishRun, rect, capture, ink, note, typeKeys, resize, TOL, BG, INK, MUTED, GOOD,
} from './helpers.js';
import { finishText } from '../../src/finish.js';

// The end of a run (runs spec §3, §5): the finish screen, and the run's
// record kept in the browser.

// The words of a realistic run, put on the finish screen and centred as
// after a finish. A run played through the handle takes no time, and its
// "0:00.0", "New best", "No misses" are nearly symmetric in their advance:
// their ink is centred to within the tolerance even unplaced. These are
// not ("2:09.1" is 0.66px off at 2x, 0.80px at 1x), so centring is tested.
const SLOWER = finishText(1, 129_100, 2, 68_900);        // 2:09.1, Best 1:08.9, 2 misses
const NEW_BEST = finishText(1, 72_400, 1, null);         // 1:12.4, New best, 1 miss
const showRun = (page, text) => page.evaluate(t => {
  const { finish } = window.mathtime;
  finish.show(t);
  finish.place();
}, text);

const runs = page => page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.runs')) ?? []);
// Runs kept before the page loads.
const keptBefore = (page, records) => page.addInitScript(r => localStorage.setItem('mathtime.runs', JSON.stringify(r)), records);
const earlier = (level, totalMs) => ({
  id: `earlier-${level}-${totalMs}`, level, finishedAt: '2026-11-01T09:30:00.000Z', totalMs, misses: 0, problems: [],
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIME = /^\d+:\d\d\.\d$/;

// A wrong answer to the problem on screen: a digit that can't be it.
async function missOnce(page) {
  const right = await page.evaluate(() => window.mathtime.game.state.problem.answer);
  await typeKeys(page, [String((right + 1) % 10), 'Enter']);
}

test('the 20th correct answer turns green, fills the bar, and the finish screen comes 0.35s later', async ({ page }) => {
  await open(page);
  await playTo(page, 20);
  await page.evaluate(() => {
    const eq = document.querySelector('#eq');
    const at = window.finishLog = {};
    addEventListener('keydown', e => { if (e.key === 'Enter') at.enter = performance.now(); });
    new MutationObserver(() => {
      if (eq.classList.contains('correct') && !at.green) at.green = document.querySelectorAll('.run span.done').length;
    }).observe(eq, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(() => {
      if (document.body.classList.contains('at-finish')) at.finish ??= performance.now();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });
  await answer(page);
  await expect(page.locator('.finish')).toBeVisible();
  const log = await page.evaluate(() => window.finishLog);
  expect(log.green).toBe(20);
  const ms = log.finish - log.enter;
  note('green → finish', ms, 'ms');
  expect(Math.abs(ms - 350)).toBeLessThanOrEqual(40);
});

test('the finish screen: the level, the time, "New best" on a first run, the misses; "Again" focused', async ({ page }) => {
  await open(page);
  await finishRun(page);
  for (const hidden of ['.stage', '.run', '.pad', '.lives', '.select']) await expect(page.locator(hidden)).toBeHidden();
  const screen = page.getByRole('region', { name: 'Level 1 complete' });
  await expect(screen).toBeVisible();
  await expect(page.locator('.finish .done-title')).toHaveText('Level 1 complete');
  await expect(page.locator('.finish .done-time')).toHaveText(TIME);
  await expect(page.locator('.finish .done-best')).toHaveText('New best');
  await expect(page.locator('.finish .done-best')).toHaveCSS('color', 'rgb(143, 240, 192)');
  await expect(page.locator('.finish .done-misses')).toHaveText('No misses');
  await expect(page.locator('.crumbs .here')).toHaveText('Level 1');
  await expect(page.locator('.crumbs .topic')).toHaveText('Addition');
  const again = page.locator('.finish .again');
  await expect(again).toBeFocused();
  await expect(again).toHaveCSS('outline-style', 'solid');
  await expect(again).toHaveCSS('outline-color', 'rgb(238, 245, 255)');
  await expect(again).toHaveCSS('outline-width', '2px');
  await expect(again).toHaveCSS('outline-offset', '4px');
  const time = await page.locator('.finish .done-time').textContent();
  await expect(page.locator('#status')).toHaveText(`Level 1 complete. ${time}, new best.`);
});

test('a run slower than the best shows the best, and screen readers hear it', async ({ page }) => {
  await keptBefore(page, [earlier(1, 1)]);
  await open(page);
  await finishRun(page);
  await expect(page.locator('.finish .done-best')).toHaveText('Best 0:00.0');
  await expect(page.locator('.finish .done-best')).not.toHaveClass(/\bnew\b/);
  await expect(page.locator('.finish .done-best')).toHaveCSS('color', 'rgb(182, 205, 238)');
  const time = await page.locator('.finish .done-time').textContent();
  await expect(page.locator('#status')).toHaveText(`Level 1 complete. ${time}, best 0:00.0.`);
  expect(await runs(page)).toHaveLength(2);
});

test('a run faster than the best is a new best; other levels\' runs don\'t count', async ({ page }) => {
  await keptBefore(page, [earlier(1, 36_000_000), earlier(2, 1)]);
  await open(page);
  await finishRun(page);
  await expect(page.locator('.finish .done-best')).toHaveText('New best');
});

test('the run is kept in the browser as its record: id, level, finish time, total, misses, 20 problems in order', async ({ page }) => {
  await open(page, 2);
  await playTo(page, 20);
  const last = await page.evaluate(() => window.mathtime.game.state.problem);
  const before = Date.now();
  await answer(page);
  await expect(page.locator('.finish .done-title')).toHaveText('Level 2 complete');
  const kept = await runs(page);
  expect(kept).toHaveLength(1);
  const [record] = kept;
  expect(Object.keys(record)).toEqual(['id', 'level', 'finishedAt', 'totalMs', 'misses', 'problems']);
  expect(record.id).toMatch(UUID);
  expect(record.level).toBe(2);
  expect(record.finishedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  expect(Date.parse(record.finishedAt)).toBeGreaterThanOrEqual(before - 1000);
  expect(Date.parse(record.finishedAt)).toBeLessThanOrEqual(Date.now());
  expect(Number.isInteger(record.totalMs)).toBe(true);
  expect(record.misses).toBe(0);
  expect(record.problems).toHaveLength(20);
  expect(new Set(record.problems.map(p => `${p.a} ${p.b}`)).size).toBe(20);
  for (const p of record.problems) {
    expect(Object.keys(p)).toEqual(['a', 'b', 'ms', 'misses']);
    expect(p.b).toBeLessThanOrEqual(p.a);
    expect(Number.isInteger(p.ms)).toBe(true);
    expect(p.misses).toBe(0);
  }
  expect(record.problems.at(-1)).toMatchObject({ a: last.a, b: last.b });
  // The total runs from the first problem to the last answer, so it holds
  // every problem's time (each rounded, by up to 0.5ms).
  expect(record.totalMs).toBeGreaterThanOrEqual(record.problems.reduce((sum, p) => sum + p.ms, 0) - 11);
});

test('misses are counted across the run, and kept for each problem', async ({ page }) => {
  await open(page);
  await playTo(page, 5);
  await missOnce(page);
  await playTo(page, 20);
  await missOnce(page);
  await missOnce(page);
  await answer(page);
  await expect(page.locator('.finish .done-misses')).toHaveText('3 misses');
  const [record] = await runs(page);
  expect(record.misses).toBe(3);
  expect(record.problems.map(p => p.misses)).toEqual([0, 0, 0, 0, 1, ...Array(14).fill(0), 2]);
});

test('"Again" starts a new run of the same level, also on Enter', async ({ page }) => {
  await open(page, 2);
  await finishRun(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.finish')).toBeHidden();
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  await expect(page.locator('.run span.done')).toHaveCount(0);
  await expect(page.locator('.crumbs .here')).toHaveText('Level 2');
  await expect(page.locator('#eq')).not.toHaveClass(/\bcorrect\b/);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await expect(page.locator('#ans')).toBeFocused();
});

test('"Levels" goes to the selector, with this level marked and focused', async ({ page }) => {
  await open(page, 2);
  await finishRun(page);
  await page.locator('.finish .levels').click();
  await expect(page.locator('.select')).toBeVisible();
  await expect(page.locator('.finish')).toBeHidden();
  await expect(levelRow(page, 2)).toHaveClass(/\bcurrent\b/);
  await expect(levelRow(page, 2)).toBeFocused();
});

// "Levels" pressed twice at its centre by `twice(x, y)`, from a Level 1
// run: the second press, on the Level 2 row that takes its place, must not
// start Level 2 or take the focus from Level 1's. A tap there once the
// double tap is over chooses Level 2.
async function pressLevelsTwice(page, twice, tap) {
  await open(page);
  await finishRun(page);
  const box = await page.locator('.finish .levels').boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await twice(x, y);
  await expect(page.locator('.select')).toBeVisible();
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('.row')?.dataset.level, [x, y])).toBe('2');
  await expect(levelRow(page, 1)).toBeFocused();
  await page.waitForTimeout(450);
  await tap(x, y);
  await expect(page.locator('.select')).toBeHidden();
  await expect(page.locator('.crumbs .here')).toHaveText('Level 2');
}

test('a double click on "Levels" stops at the selector', async ({ page }) => {
  await pressLevelsTwice(page, (x, y) => page.mouse.dblclick(x, y), (x, y) => page.mouse.click(x, y));
});

test('a second press on "Levels" that starts in time is ignored, even held past the double tap', async ({ page }) => {
  await pressLevelsTwice(page, async (x, y) => {
    await page.mouse.click(x, y);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.up();
  }, (x, y) => page.mouse.click(x, y));
});

// As from a browser without pointer events, or a screen reader's press.
test('a click seen without its pointer down is judged by its own time', async ({ page }) => {
  await pressLevelsTwice(page, (x, y) => page.mouse.dblclick(x, y), (x, y) => page.evaluate(([x, y]) => {
    document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  }, [x, y]));
});

test.describe('by touch', () => {
  test.use({ hasTouch: true });
  test('a double tap on "Levels" stops at the selector', async ({ page }) => {
    const tap = (x, y) => page.touchscreen.tap(x, y);
    await pressLevelsTwice(page, async (x, y) => { await tap(x, y); await tap(x, y); }, tap);
  });
});

test('"Levels" by keyboard: the selector takes a press at once', async ({ page }) => {
  await open(page);
  await finishRun(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(levelRow(page, 1)).toBeFocused();
  await levelRow(page, 2).click();
  await expect(page.locator('.crumbs .here')).toHaveText('Level 2');
});

test('Tab moves between "Again" and "Levels"', async ({ page }) => {
  await open(page);
  await finishRun(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('.finish .levels')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.finish .again')).toBeFocused();
});

test('a held Enter on the last answer does not press "Again"', async ({ page }) => {
  await open(page);
  await playTo(page, 20);
  const right = await page.evaluate(() => window.mathtime.game.state.problem.answer);
  await typeKeys(page, [...String(right)]);
  await page.keyboard.down('Enter');                     // the last answer, held
  await expect(page.locator('.finish .again')).toBeFocused();
  // The operating system's key repeat, arriving once "Again" has focus.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r', autoRepeat: true,
  });
  await page.keyboard.up('Enter');
  await expect(page.locator('.finish')).toBeVisible();
  await expect(page.locator('.finish .again')).toBeFocused();
});

test('a run that runs out of lives is not kept; the next finished one is, alone', async ({ page }) => {
  await open(page);
  await playTo(page, 19);
  for (let i = 0; i < 3; i++) await missOnce(page);
  await expect(page.locator('.select')).toBeVisible();
  expect(await runs(page)).toEqual([]);
  await levelRow(page, 1).click();
  await finishRun(page);
  expect(await runs(page)).toHaveLength(1);
});

test('with storage blocked, the run still finishes, as a new best', async ({ page }) => {
  await page.addInitScript(() => {
    const refuse = () => { throw new DOMException('Storage is blocked (test)', 'SecurityError'); };
    Storage.prototype.getItem = refuse;
    Storage.prototype.setItem = refuse;
  });
  await open(page);
  await finishRun(page);
  await expect(page.locator('.finish .done-best')).toHaveText('New best');
  await expect(page.locator('.finish .again')).toBeFocused();
});

test('a record that can\'t be made still shows the finish screen, against the best kept', async ({ page }) => {
  // As on an origin that isn't secure, where there is no crypto.randomUUID().
  await page.addInitScript(() => Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined }));
  await keptBefore(page, [earlier(1, 1)]);
  await open(page);
  await finishRun(page);
  await expect(page.locator('.finish .done-time')).toHaveText(TIME);
  await expect(page.locator('.finish .done-best')).toHaveText('Best 0:00.0');
  await expect(page.locator('.finish .again')).toBeFocused();
  expect(await runs(page)).toEqual([earlier(1, 1)]);
});

// The column scrolls where the screen is too short for it (held sideways),
// just far enough to show "Again" and its focus ring, and the page never
// scrolls: as the level selector's list does.
for (const [width, height] of [[568, 320], [640, 320]]) test(`at ${width}×${height} the column scrolls just far enough to show "Again" and its ring`, async ({ page }) => {
  const RING = 6;                                         // 2px, 4px out
  await open(page);
  await resize(page, width, height);
  await finishRun(page);
  await expect(page.locator('.finish .again')).toBeFocused();
  const { again, view, scrolled } = await page.evaluate(() => {
    const col = document.querySelector('.finish');
    const box = col.getBoundingClientRect();
    const r = col.querySelector('.again').getBoundingClientRect();
    const top = box.top + col.clientTop, left = box.left + col.clientLeft;
    return {
      again: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      // What the column shows: its padding box.
      view: { top, bottom: top + col.clientHeight, left, right: left + col.clientWidth, scrollTop: col.scrollTop },
      scrolled: [document.documentElement.scrollTop, document.body.scrollTop],
    };
  });
  expect(view.scrollTop, '"Again" was below the fold, so the column scrolled').toBeGreaterThan(0);
  expect(again.top - RING, 'ring top').toBeGreaterThanOrEqual(view.top - 0.01);
  expect(again.bottom + RING, 'ring bottom').toBeLessThanOrEqual(view.bottom + 0.01);
  expect(again.left - RING, 'ring left').toBeGreaterThanOrEqual(view.left - 0.01);
  expect(again.right + RING, 'ring right').toBeLessThanOrEqual(view.right + 0.01);
  // No further than needed: the ring ends at the column's bottom edge, give
  // or take the scroll position's rounding to a whole pixel.
  expect(view.bottom - (again.bottom + RING), 'scrolled just far enough').toBeLessThan(1);
  expect(scrolled, 'the page itself never scrolls').toEqual([0, 0]);
});

test.describe('alignment', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await freeze(page);
    await finishRun(page);
  });

  test('each line\'s ink is centred in the column', async ({ page }) => {
    const col = await rect(page, '.finish');
    const centre = (col.left + col.right) / 2;
    for (const text of [SLOWER, NEW_BEST]) {
      await showRun(page, text);
      const shot = await capture(page);
      for (const [sel, colour] of [['.done-title'], ['.done-time'], ['.done-best', text.isNew ? GOOD : MUTED], ['.done-misses', MUTED]]) {
        const r = await rect(page, `.finish ${sel}`);
        const line = ink(shot, { left: col.left, right: col.right, top: r.top - 4, bottom: r.bottom + 4 }, colour);
        note(`${text.time}: ${sel} offset`, line.midX - centre);
        expect(Math.abs(line.midX - centre), `${text.time}: ${sel}`).toBeLessThanOrEqual(TOL);
      }
    }
  });

  test('the lines are 40px, 28px, 24px, 12px and 40px apart, capitals to baseline', async ({ page }) => {
    const col = await rect(page, '.finish');
    const box = sel => rect(page, `.finish ${sel}`);
    const [title, time, best, misses, again] = await Promise.all(['.done-title', '.done-time', '.done-best', '.done-misses', '.again'].map(box));
    const gaps = [title.top - col.top, time.top - title.bottom, best.top - time.bottom, misses.top - best.bottom, again.top - misses.bottom];
    [40, 28, 24, 12, 40].forEach((want, i) => {
      note(`gap ${i + 1}`, gaps[i]);
      expect(Math.abs(gaps[i] - want), `gap ${i + 1}`).toBeLessThanOrEqual(0.01);
    });
  });

  // 12px apart, so "Again"'s focus ring (2px, 4px out) stays 6px clear of "Levels".
  // "Again" is drawn in the background colour on an ink fill. Its label is
  // 0.61px off unplaced at 2x; "Levels" is nearly symmetric in its advance,
  // and at 1x neither is more than half a pixel off, so only the phone's
  // "Again" can show a label left unplaced.
  test('the buttons are 56px tall and 12px apart, filling the column; each has its label on its ink', async ({ page }) => {
    const col = await rect(page, '.finish');
    const again = await rect(page, '.finish .again');
    const levels = await rect(page, '.finish .levels');
    expect([again.height, levels.height]).toEqual([56, 56]);
    expect(again.top).toBe(levels.top);
    expect(Math.abs(levels.left - again.right - 12)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(again.left - col.left - 16)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(col.right - levels.right - 16)).toBeLessThanOrEqual(0.01);
    const shot = await capture(page);
    const inside = b => ({ left: b.left + 4, right: b.right - 4, top: b.top + 4, bottom: b.bottom - 4 });
    for (const [name, button, label] of [['Again', again, ink(shot, inside(again), BG, INK)], ['Levels', levels, ink(shot, inside(levels))]]) {
      const off = label.midX - (button.left + button.right) / 2;
      note(`"${name}" label offset`, off);
      expect(Math.abs(off), name).toBeLessThanOrEqual(TOL);
    }
  });
});

// Desktop browsers' scrollbars take room from the column (Playwright hides
// them unless told not to): the lines are centred over the buttons, which
// fill what is left, not on the column's box.
const withScrollbars = test.extend({
  launchOptions: [async ({ launchOptions }, use) => use({ ...launchOptions, ignoreDefaultArgs: ['--hide-scrollbars'] }), { scope: 'worker' }],
});

withScrollbars('with a scrollbar taking room, each line\'s ink is centred over the buttons', async ({ page }) => {
  await open(page);
  await freeze(page);
  await resize(page, 568, 320);
  await finishRun(page);
  await showRun(page, SLOWER);
  const bar = await page.evaluate(() => { const col = document.querySelector('.finish'); return col.offsetWidth - col.clientWidth; });
  expect(bar, 'the scrollbar takes room').toBeGreaterThan(0);
  const shot = await capture(page);
  const again = await rect(page, '.finish .again');
  const levels = await rect(page, '.finish .levels');
  const centre = (again.left + levels.right) / 2;
  // Between the buttons' outer edges, so the scrollbar is not read as ink.
  for (const [sel, colour] of [['.done-title'], ['.done-time'], ['.done-best', MUTED], ['.done-misses', MUTED]]) {
    const r = await rect(page, `.finish ${sel}`);
    const line = ink(shot, { left: again.left, right: levels.right, top: r.top - 4, bottom: r.bottom + 4 }, colour);
    note(`${sel} offset`, line.midX - centre);
    expect(Math.abs(line.midX - centre), sel).toBeLessThanOrEqual(TOL);
  }
});
