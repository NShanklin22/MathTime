import { test, expect } from '@playwright/test';
import {
  open, levelRow, setProblem, playTo, answer, finishRun, rect, capture, ink, freeze, typeKeys, note, TOL, MUTED, FAINT,
} from './helpers.js';

// The breadcrumb and the way back to the level selector (Level 2 spec §4),
// and the run left behind (runs spec §1): nothing of it carries on.

// Runs in the page: `ms` after the status first reads "Correct", press Esc,
// note what leaving left (window.left), choose Level `n`, and from then on
// log #eq's own animations (window.since). With `thenAnswer`, the new
// run's first problem is then answered at once.
const leaveDuringCorrect = (page, { ms, n, thenAnswer = false }) => page.evaluate(({ ms, n, thenAnswer }) => {
  const status = document.querySelector('#status');
  const eq = document.querySelector('#eq');
  const press = key => document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  new MutationObserver((_, watch) => {
    if (status.textContent !== 'Correct') return;
    watch.disconnect();
    setTimeout(() => {
      dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      window.left = { eq: eq.className, status: status.textContent, phase: window.mathtime.game.state.phase };
      document.querySelector(`.select .row[data-level="${n}"]`).click();
      window.since = [];
      eq.addEventListener('animationstart', e => { if (e.target === eq) window.since.push(e.animationName); });
      if (thenAnswer) {
        for (const digit of String(window.mathtime.game.state.problem.answer)) press(digit);
        press('Enter');
      }
    }, ms);
  }).observe(status, { childList: true, characterData: true, subtree: true });
}, { ms, n, thenAnswer });

for (const [n, topic] of [[1, 'Addition'], [2, 'Subtraction']]) test(`Level ${n}'s breadcrumb reads "Levels › ${topic} › Level ${n}"`, async ({ page }) => {
  await open(page, n);
  await expect(page.locator('.crumbs .back')).toHaveText('Levels');
  await expect(page.locator('.crumbs .topic')).toHaveText(topic);
  await expect(page.locator('.crumbs .here')).toHaveText(`Level ${n}`);
  await expect(page.locator('.crumbs .here')).toHaveAttribute('aria-current', 'step');
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

// 100ms is while the answer shows green; 450ms is during the slide-out.
for (const ms of [100, 450]) test(`leaving ${ms}ms into a right answer's feedback leaves nothing to finish later`, async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
  await leaveDuringCorrect(page, { ms, n: 2 });
  await typeKeys(page, ['7', 'Enter']);
  await page.waitForFunction(() => window.since);
  await page.waitForTimeout(1200);                            // past every timer the old feedback had
  expect(await page.evaluate(() => window.left), 'as it left').toEqual({ eq: 'eq', status: '', phase: 'left' });
  expect(await page.evaluate(() => window.since), 'animations after choosing Level 2').toEqual([]);
  await expect(page.locator('.crumbs .here')).toHaveText('Level 2');
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  expect(await page.evaluate(() => document.querySelector('#eq').className)).toBe('eq');
  await expect(page.locator('#eq')).toHaveCSS('opacity', '1');
  await expect(page.locator('#status')).toHaveText(/^Question 1 of 20: \d minus \d$/);
});

// The old run's next() must not move the new run on: a right answer straight
// after coming back gets one green and one slide, not two.
test('a right answer straight after coming back slides once: the old run\'s feedback is gone', async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
  await leaveDuringCorrect(page, { ms: 100, n: 1, thenAnswer: true });
  await typeKeys(page, ['7', 'Enter']);
  await page.waitForFunction(() => window.since);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.since), 'one slide out, one slide in').toEqual(['out', 'in']);
  await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
  await expect(page.locator('.run span.done')).toHaveCount(1);
});

test('leaving during the out-of-lives shake, then coming straight back, keeps you playing', async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
  await typeKeys(page, ['9', 'Enter', '9', 'Enter', '9', 'Enter', 'Escape']);
  await expect(page.locator('.select')).toBeVisible();
  await levelRow(page, 2).click();
  await page.waitForTimeout(600);                             // past the 0.45s the selector waited
  await expect(page.locator('.select')).toBeHidden();
  await expect(page.locator('#ans')).toBeFocused();
});

test('leaving during the last answer\'s green stops at the selector: the finish screen never comes', async ({ page }) => {
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
  await page.waitForTimeout(600);                             // past the 0.35s the finish screen waited for
  await expect(page.locator('.finish')).toBeHidden();
  expect(await page.evaluate(() => document.body.className)).toBe('at-select');
  expect(await page.evaluate(() => window.mathtime.game.state.phase)).toBe('left');
  // It was finished, so it was kept: its row shows the mark.
  await expect(levelRow(page, 1)).toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 1)).toBeFocused();
});
