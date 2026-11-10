import { test, expect } from './fixtures.js';
import {
  open, levelRow, setProblem, playTo, answer, finishRun, rect, capture, ink, freeze, typeKeys, note, resize, TOL, MUTED, FAINT,
} from './helpers.js';
import { LEVELS, levelName } from '../../src/levels.js';

// The breadcrumb and the way back to the level selector (Level 2 spec §4),
// and the run left behind (runs spec §1): nothing of it carries on.

// Runs in the page: `ms` after the status first reads "Correct", press Esc,
// note what leaving left (window.left), choose Level `n`, and from then on
// log the feedback classes added to #eq (window.since).
const leaveDuringCorrect = (page, { ms, n }) => page.evaluate(({ ms, n }) => {
  const status = document.querySelector('#status');
  const eq = document.querySelector('#eq');
  new MutationObserver((_, watch) => {
    if (status.textContent !== 'Correct') return;
    watch.disconnect();
    setTimeout(() => {
      dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      window.left = { eq: eq.className, status: status.textContent, phase: window.mathtime.game.state.phase };
      document.querySelector(`.select .row[data-level="${n}"]`).click();
      window.since = [];
      sinceOn(eq);
    }, ms);
  }).observe(status, { childList: true, characterData: true, subtree: true });
}, { ms, n });

// In the page: from now on, every class added to `eq`, in window.since.
const SINCE = `window.sinceOn = eq => {
  let had = new Set(eq.classList);
  new MutationObserver(() => {
    for (const name of eq.classList) if (!had.has(name)) window.since.push(name);
    had = new Set(eq.classList);
  }).observe(eq, { attributes: true, attributeFilter: ['class'] });
};`;
test.beforeEach(async ({ page }) => { await page.addInitScript(SINCE); });

// Which parts of the breadcrumb show, in order: the way back's word or its
// chevron, the separator, the level.
const shownCrumbs = page => page.locator('.crumbs').evaluate(crumbs => [...crumbs.querySelectorAll('.back .word, .back .chevron, .sep, .here')]
  .filter(el => el.getClientRects().length).map(el => el.classList[0]));

// Each level is named by its topic and its number within it, in one crumb,
// the current one: "Levels › Subtraction 3". At 375px and 1440px wide the
// whole breadcrumb fits for every level.
test('each level\'s breadcrumb reads "Levels › <topic> <number in it>", the level the current crumb', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
  const read = [];
  for (const level of LEVELS) {
    await levelRow(page, level.n).click();
    await expect(page.locator('.crumbs .back')).toHaveText('Levels');
    await expect(page.locator('.crumbs .here')).toHaveAttribute('aria-current', 'step');
    expect(await shownCrumbs(page), levelName(level)).toEqual(['word', 'sep', 'here']);
    read.push([level.n, await page.locator('.crumbs .here').textContent()]);
    await page.keyboard.press('Escape');
  }
  expect(read).toEqual([
    [1, 'Addition 1'], [2, 'Subtraction 1'], [3, 'Subtraction 2'], [4, 'Multiplication 1'],
    [5, 'Division 1'], [6, 'Addition 2'], [7, 'Subtraction 3'],
  ]);
  // The topic is no longer a crumb of its own.
  await expect(page.locator('.crumbs .topic, .crumbs .topic-sep')).toHaveCount(0);
  await expect(page.locator('.crumbs .sep')).toHaveCount(1);
});

test('"Levels" is a link back to the selector, never a Tab stop, with Esc as its shortcut', async ({ page }) => {
  await open(page, 2);
  const link = page.getByRole('link', { name: 'Levels' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('aria-keyshortcuts', 'Escape');
  await expect(link).toHaveAttribute('tabindex', '-1');
  await link.click();
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 2)).toHaveClass(/\bcurrent\b/);
  await expect(levelRow(page, 2)).toBeFocused();
  expect(new URL(page.url()).hash).toBe('');                  // no "#" left in the address
});

test('Esc goes back too, but not while an input method is composing', async ({ page }) => {
  await open(page);
  await page.evaluate(() => document.querySelector('#ans').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })));
  await expect(page.locator('.select')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 1)).toHaveClass(/\bcurrent\b/);
  await expect(levelRow(page, 1)).toBeFocused();
  await page.keyboard.press('Escape');                        // on the selector: nothing
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 1)).toBeFocused();
});

// The finish screen shows the breadcrumb, and Esc is its link's shortcut.
test('Esc on the finish screen goes to the selector too, that level marked', async ({ page }) => {
  await open(page, 2);
  await finishRun(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.select')).toBeVisible();
  await expect(page.locator('.finish')).toBeHidden();
  await expect(levelRow(page, 2)).toHaveClass(/\bcurrent\b/);
  await expect(levelRow(page, 2)).toBeFocused();
});

test('the link\'s hit area runs from the top of the screen to the header\'s foot, and from the screen edge to 8px past the word', async ({ page }) => {
  await open(page);
  const hit = await page.evaluate(() => {
    const link = document.querySelector('.crumbs .back').getBoundingClientRect();
    const header = document.querySelector('.top').getBoundingClientRect();
    const on = (x, y) => !!document.elementFromPoint(x, y)?.closest('.back');
    const midY = link.top + link.height / 2;
    return {
      top: on(link.left + 2, 0.5),
      edge: on(0.5, midY),
      past: [on(link.right + 7.5, midY), on(link.right + 8.5, midY)],
      foot: [on(link.left + 2, header.bottom - 0.5), on(link.left + 2, header.bottom + 0.5)],
      header: header.bottom,
      phone: innerWidth <= 480,
    };
  });
  expect(hit.top, 'reaches the top of the screen').toBe(true);
  expect(hit.edge, 'reaches the screen edge').toBe(true);
  expect(hit.past, '8px past the word').toEqual([true, false]);
  expect(hit.foot, 'down to the header\'s foot, no further').toEqual([true, false]);
  // 16px (20px on desktop) above the 20px line, and the 12px foot.
  expect(hit.header, 'all the room the header has').toBe(hit.phone ? 48 : 52);
});

test('the underline runs from the first ink of "Levels" to its last, 4px below the baseline', async ({ page }) => {
  await open(page);
  await freeze(page);
  const shot = await capture(page);
  const r = await rect(page, '.crumbs .back');
  const near = 0.5 / await page.evaluate(() => devicePixelRatio) + 0.05;
  // "Levels" has no descenders, so its ink ends on the baseline, about
  // 15.3px down its 20px line; the underline is about 19.3px down.
  const text = ink(shot, { left: r.left - 4, right: r.right + 4, top: r.top - 2, bottom: r.top + 17.5 }, MUTED);
  const line = ink(shot, { left: r.left - 4, right: r.right + 4, top: r.top + 17.5, bottom: r.bottom + 3 }, FAINT);
  note('underline start from the ink', line.left - text.left);
  note('underline end from the ink', line.right - text.right);
  note('underline below the baseline', line.top - text.bottom);
  expect(Math.abs(line.left - text.left), 'start').toBeLessThanOrEqual(near);
  expect(Math.abs(line.right - text.right), 'end').toBeLessThanOrEqual(near);
  expect(Math.abs(line.top - text.bottom - 4), '4px below the baseline').toBeLessThanOrEqual(TOL);
  expect(Math.abs(line.bottom - line.top - 1), '1px, sharp').toBeLessThanOrEqual(0.05);
});

test('on hover the underline takes the text colour', async ({ page }) => {
  await open(page);
  const colour = () => page.evaluate(() => getComputedStyle(document.querySelector('.crumbs .back'), '::before').backgroundColor);
  expect(await colour()).toBe('rgb(111, 149, 204)');
  await page.hover('.crumbs .back');
  await expect.poll(colour).toBe('rgb(182, 205, 238)');
});

// ---------- Where the whole breadcrumb doesn't fit ----------

// The form is the window's, not the level's (the UI review): where the
// whole breadcrumb with the longest of all levels' names, "Levels ›
// Multiplication 1", doesn't fit beside the hearts, every level's way back
// shrinks to a back chevron, the separator's own shape pointing left,
// followed by the level: "‹ Addition 1", "‹ Multiplication 1". The play
// screen and the finish screen alike (it keeps the hearts' room, unseen).
// It is the same link, "Levels" to screen readers, with Esc as its
// shortcut and its hit area; the chevron alone is the cue, with no
// underline. Where the longest fits, every level's breadcrumb is whole.

const playLevel = (page, n) => page.evaluate(n => window.mathtime.play(window.mathtime.levels.find(l => l.n === n)), n);

// The switch: "Levels › Multiplication 1" is 221.14px, and the room beside
// the hearts is the width less 132px (two 16px gutters, the hearts' 84px
// and the 16px gap), so it is whole from 354px, not from 353px, where it
// would run 0.14px into the gap.
for (const [width, form] of [[320, 'chevron here'], [340, 'chevron here'], [353, 'chevron here'], [354, 'word sep here'], [360, 'word sep here'], [375, 'word sep here']]) {
  test(`at ${width}px wide every level's breadcrumb is ${form === 'chevron here' ? 'the back chevron' : 'whole'}, on the play screen and the finish screen`, async ({ page }) => {
    await open(page);
    await resize(page, width, 640);
    const found = {};
    let clear = Infinity;                                   // the level's end to the hearts, at the closest
    for (const level of LEVELS) {
      await playLevel(page, level.n);
      await expect(page.locator('.crumbs .here')).toHaveText(levelName(level));
      found[levelName(level)] = (await shownCrumbs(page)).join(' ');
      clear = Math.min(clear, await page.evaluate(() => document.querySelector('.lives').getBoundingClientRect().left
        - document.querySelector('.crumbs .here').getBoundingClientRect().right));
    }
    note('closest to the hearts', clear);
    expect(clear, 'every level clear of the hearts by the header\'s 16px gap').toBeGreaterThanOrEqual(16 - 0.001);
    // The finish screen, after the shortest name and after the longest.
    for (const n of [1, 4]) {
      await playLevel(page, n);
      await finishRun(page);
      await expect(page.locator('.finish .done-title')).toHaveText(`${levelName(LEVELS.find(l => l.n === n))} complete`);
      found[`${levelName(LEVELS.find(l => l.n === n))}, finished`] = (await shownCrumbs(page)).join(' ');
    }
    expect(Object.values(found), JSON.stringify(found)).toEqual(Array(LEVELS.length + 2).fill(form));
  });
}

// The longest name decides: one longer than any built level's, added to the
// levels, makes every level's breadcrumb the short one where the whole fit
// before; taken out again, it is whole again.
test('the longest of all levels\' names decides: a longer one shortens every level\'s breadcrumb', async ({ page }) => {
  await open(page);
  await resize(page, 375, 640);
  expect(await shownCrumbs(page)).toEqual(['word', 'sep', 'here']);
  await page.evaluate(() => {
    window.mathtime.levels.push({ n: 99, k: 1, topic: 'Multiplication and division', name: 'Longer than any' });
    window.mathtime.play(window.mathtime.levels[0]);
  });
  await expect(page.locator('.crumbs .here')).toHaveText('Addition 1');
  expect(await shownCrumbs(page), '"Levels › Multiplication and division 1" does not fit at 375px').toEqual(['chevron', 'here']);
  await page.evaluate(() => {
    window.mathtime.levels.pop();
    window.mathtime.play(window.mathtime.levels[0]);
  });
  expect(await shownCrumbs(page), 'whole again').toEqual(['word', 'sep', 'here']);
});

test.describe('at 320px wide', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 4);                                    // Multiplication 1, the longest
    await resize(page, 320, 640);
  });

  test('"‹ Multiplication 1": the link is still "Levels", with Esc as its shortcut, and goes back', async ({ page }) => {
    expect(await shownCrumbs(page)).toEqual(['chevron', 'here']);
    await expect(page.locator('.crumbs .here')).toHaveText('Multiplication 1');
    await expect(page.locator('.crumbs .here')).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('.crumbs .back .chevron')).toHaveAttribute('aria-hidden', 'true');
    const link = page.getByRole('link', { name: 'Levels', exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('aria-keyshortcuts', 'Escape');
    await expect(link).toHaveAttribute('tabindex', '-1');
    // One line, clear of the hearts by the header's gap.
    const fit = await page.evaluate(() => {
      const crumbs = document.querySelector('.crumbs');
      const here = crumbs.querySelector('.here').getBoundingClientRect(), lives = document.querySelector('.lives').getBoundingClientRect();
      return { oneLine: crumbs.scrollWidth <= crumbs.clientWidth, clear: lives.left - here.right };
    });
    note('"Multiplication 1" to the hearts', fit.clear);
    expect(fit.oneLine).toBe(true);
    expect(fit.clear).toBeGreaterThanOrEqual(16);
    await link.click();
    await expect(page.locator('.select')).toBeVisible();
    await expect(levelRow(page, 4)).toHaveClass(/\bcurrent\b/);
    await expect(levelRow(page, 4)).toBeFocused();
    expect(new URL(page.url()).hash).toBe('');
  });

  // The separator, "›", in the same 12px box with the same stroke, turned
  // to point left: its point is on the left, its open ends on the right.
  // Mirrored, then moved 0.25px left, so its ink (its path's box and half
  // its stroke) runs from 3px to 8px of its box, on whole pixels.
  test('the chevron is the separator\'s shape pointing left, in the same box and line', async ({ page }) => {
    const shape = sel => page.evaluate(sel => {
      const svg = document.querySelector(sel), path = svg.querySelector('path');
      const cs = getComputedStyle(path), box = path.getBBox(), r = svg.getBoundingClientRect();
      const line = document.querySelector('.crumbs').getBoundingClientRect();
      const at = (x, y) => path.isPointInStroke(new DOMPoint(x, y));
      return {
        viewBox: svg.getAttribute('viewBox'), width: r.width, height: r.height, mid: r.top + r.height / 2 - (line.top + line.height / 2),
        stroke: [cs.strokeWidth, cs.strokeLinecap, cs.strokeLinejoin, cs.fill], box: [box.x, box.y, box.width, box.height],
        point: { left: at(box.x, 6), right: at(box.x + box.width, 6) },
      };
    }, sel);
    const chevron = await shape('.crumbs .back .chevron');
    await resize(page, 1440, 900);                          // the whole breadcrumb, the separator showing
    const sep = await shape('.crumbs .sep');
    expect(chevron.viewBox).toBe(sep.viewBox);
    expect([chevron.width, chevron.height, chevron.stroke]).toEqual([sep.width, sep.height, sep.stroke]);
    expect(chevron.mid, 'centred on the line, as the separator is').toBeCloseTo(sep.mid, 5);
    // Mirrored in the 12-unit box, the same size, the left edge where the
    // separator's right is, less 0.25: its ink from 3 to 8.
    expect(chevron.box[1]).toBeCloseTo(sep.box[1], 5);
    expect(chevron.box[2]).toBeCloseTo(sep.box[2], 5);
    expect(chevron.box[3]).toBeCloseTo(sep.box[3], 5);
    expect(chevron.box[0]).toBeCloseTo(12 - (sep.box[0] + sep.box[2]) - 0.25, 5);
    const half = parseFloat(chevron.stroke[0]) / 2;
    expect([chevron.box[0] - half, chevron.box[0] + chevron.box[2] + half], 'its ink on whole pixels').toEqual([3, 8]);
    expect(chevron.point, 'points left').toEqual({ left: true, right: false });
    expect(sep.point, 'the separator points right').toEqual({ left: false, right: true });
  });

  test('the chevron link\'s hit area runs from the top of the screen to the header\'s foot, and from the screen edge to 8px past it', async ({ page }) => {
    const hit = await page.evaluate(() => {
      const link = document.querySelector('.crumbs .back').getBoundingClientRect();
      const header = document.querySelector('.top').getBoundingClientRect();
      const on = (x, y) => !!document.elementFromPoint(x, y)?.closest('.back');
      const midY = link.top + link.height / 2;
      return {
        top: on(link.left + 2, 0.5),
        edge: on(0.5, midY),
        past: [on(link.right + 7.5, midY), on(link.right + 8.5, midY)],
        foot: [on(link.left + 2, header.bottom - 0.5), on(link.left + 2, header.bottom + 0.5)],
        line: [link.height, document.querySelector('.crumbs').getBoundingClientRect().top - link.top],
        header: header.bottom,
      };
    });
    expect(hit.line, 'the link is the crumbs\' 20px line, as the word is').toEqual([20, 0]);
    expect(hit.top, 'reaches the top of the screen').toBe(true);
    expect(hit.edge, 'reaches the screen edge').toBe(true);
    expect(hit.past, '8px past the chevron').toEqual([true, false]);
    expect(hit.foot, 'down to the header\'s foot, no further').toEqual([true, false]);
    expect(hit.header, 'all the room the header has').toBe(48);
  });

  // A 5px underline under the chevron read as a stray dash, "‹_" (the UI
  // review): the chevron alone is the cue. Nothing is drawn where the
  // word's underline goes, about 19.3px down the 20px line.
  test('the chevron has no underline', async ({ page }) => {
    await freeze(page);
    const r = await rect(page, '.crumbs .back');
    const shot = await capture(page);
    const chevron = ink(shot, { left: r.left - 4, right: r.right + 4, top: r.top - 2, bottom: r.top + 17.5 }, MUTED);
    expect(chevron, 'the chevron is drawn').not.toBeNull();
    expect(ink(shot, { left: r.left - 4, right: r.right + 4, top: r.top + 17.5, bottom: r.bottom + 3 }, FAINT), 'nothing below it').toBeNull();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.crumbs .back'), '::before').display)).toBe('none');
  });

  // The whole link's hover strengthens its mark a step, its faint underline
  // to the link's own colour, as the scrollbar's thumb does. The chevron,
  // with no underline, is that mark: it brightens from the muted colour to
  // the text's.
  test('on hover the chevron brightens to the text colour', async ({ page }) => {
    const colour = () => page.evaluate(() => getComputedStyle(document.querySelector('.crumbs .back .chevron')).color);
    expect(await colour()).toBe('rgb(182, 205, 238)');
    await page.hover('.crumbs .back .chevron');
    await expect.poll(colour).toBe('rgb(238, 245, 255)');
  });

  // The link is never a Tab stop, and while you play a focus that lands on
  // it is sent back to the answer (input.js): in either form it never keeps
  // the focus, so it never shows a focus ring.
  test('in either form the link never keeps the focus: it goes back to the answer', async ({ page }) => {
    const focusLink = () => page.evaluate(() => {
      document.querySelector('.crumbs .back').focus();
      return document.activeElement.id;
    });
    await page.keyboard.press('Shift');                     // a key the game ignores, so a focus would show
    expect(await focusLink(), 'the chevron').toBe('ans');
    await resize(page, 1440, 900);
    await expect(page.locator('.crumbs .back .word')).toBeVisible();
    expect(await focusLink(), 'the word').toBe('ans');
  });
});

test('leaving mid-problem abandons it: the level starts again at question 1', async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
  await typeKeys(page, ['7', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
  await setProblem(page, 3, 4);
  await typeKeys(page, ['9', 'Enter', '1']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  await page.keyboard.press('Escape');
  // Nothing left to announce, so the next problem is heard even if it reads the same.
  await expect(page.locator('#status')).toBeEmpty();
  expect(await page.evaluate(() => window.mathtime.game.state.phase)).toBe('left');
  await levelRow(page, 1).click();
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await expect(page.locator('#shown')).toHaveText('');
  await expect(page.locator('.run span.done')).toHaveCount(0);
});

// 100ms is while the pen traces; 280ms is during the fade-out.
for (const ms of [100, 280]) test(`leaving ${ms}ms into a right answer's feedback leaves nothing to finish later`, async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
  await leaveDuringCorrect(page, { ms, n: 2 });
  await typeKeys(page, ['7', 'Enter']);
  await page.waitForFunction(() => window.since);
  await page.waitForTimeout(1200);                            // past every timer the old feedback had
  expect(await page.evaluate(() => window.left), 'as it left').toEqual({ eq: 'eq', status: '', phase: 'left' });
  expect(await page.evaluate(() => window.since), 'feedback after choosing Level 2').toEqual([]);
  await expect(page.locator('.fx')).toHaveCount(0);
  await expect(page.locator('.crumbs .here')).toHaveText('Subtraction 1');
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  expect(await page.evaluate(() => document.querySelector('#eq').className)).toBe('eq');
  await expect(page.locator('#eq')).toHaveCSS('opacity', '1');
  await expect(page.locator('#status')).toHaveText(/^Question 1 of 20: \d minus \d$/);
});

// The old run's next() must not move the new run on. play() is called
// straight, not through toSelector(), so only play()'s own view.reset()
// stops the old feedback: the new problem is not green, and a right answer
// to it is inked, fades out and fades in once.
test('a run started during a right answer\'s feedback is not moved on by it', async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
  await page.evaluate(() => {
    const status = document.querySelector('#status'), eq = document.querySelector('#eq');
    const { game, play, levels } = window.mathtime;
    const press = key => document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    new MutationObserver((_, watch) => {
      if (status.textContent !== 'Correct') return;
      watch.disconnect();
      setTimeout(() => {
        play(levels[0]);                       // no toSelector(): only play()'s reset stands guard
        window.green = eq.classList.contains('correct') || eq.classList.contains('inked');
        window.since = [];
        window.sinceOn(eq);
        for (const d of String(game.state.problem.answer)) press(d);
        press('Enter');
      }, 100);
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
  await typeKeys(page, ['7', 'Enter']);
  await page.waitForFunction(() => window.since);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.green), 'new problem not green').toBe(false);
  expect(await page.evaluate(() => window.since)).toEqual(['correct', 'inked', 'out', 'in']);
  await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
});

test('leaving during the out-of-lives red-line, then coming straight back, keeps you playing', async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
  await typeKeys(page, ['9', 'Enter', '9', 'Enter', '9', 'Enter', 'Escape']);
  await expect(page.locator('.select')).toBeVisible();
  await levelRow(page, 2).click();
  await page.waitForTimeout(650);                             // past the 0.5s the selector waited
  await expect(page.locator('.select')).toBeHidden();
  await expect(page.locator('#ans')).toBeFocused();
});

test('leaving during the last answer\'s ink stops at the selector: the finish screen never comes', async ({ page }) => {
  await open(page);
  await playTo(page, 20);
  await page.evaluate(() => {
    const status = document.querySelector('#status');
    new MutationObserver((_, watch) => {
      if (status.textContent !== 'Correct') return;
      watch.disconnect();
      setTimeout(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })), 100);
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
  await answer(page);
  await expect(page.locator('.select')).toBeVisible();
  await page.waitForTimeout(600);                             // past the 0.24s the finish screen waited for
  await expect(page.locator('.finish')).toBeHidden();
  expect(await page.evaluate(() => document.body.className)).toBe('at-select');
  expect(await page.evaluate(() => window.mathtime.game.state.phase)).toBe('left');
  // It was finished, so it was kept: its row shows the mark.
  await expect(levelRow(page, 1)).toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 1)).toBeFocused();
});
