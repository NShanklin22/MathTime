import { test, expect } from '@playwright/test';
import {
  open, levelRow, freeze, showOutline, settle, resize, setProblem, layOut, rect, capture, ink, digitInk, digitBand,
  boxEdges, boxInside, borderInner, outlineEdges, showAnswer, groupOffset, equalsGap, labelInk, note, fontSize,
  cssFontSize, typeKeys, TOL, MUTED,
} from './helpers.js';

// Level 3, subtraction past 10 (Level 3 spec §1, §2). Its play screen is
// Level 2's with a first number of two digits, and every alignment row of
// the Level 1 spec §6 applies to that number too: its ink, the gaps around
// the operators, and the fit on narrow screens. The rows the two digits or
// the level change are measured here.

test.beforeEach(async ({ page }) => {
  await open(page, 3);
});

test('Level 3 asks a two-digit number less one digit, and screen readers hear it: "13 minus 5"', async ({ page }) => {
  await expect(page.locator('#eq .op').first()).toHaveText('−');
  await expect(page.locator('#eq .op').nth(1)).toHaveText('=');
  const { a, b, answer } = await page.evaluate(() => window.mathtime.game.state.problem);
  expect(a).toBeGreaterThanOrEqual(10);
  expect(a).toBeLessThanOrEqual(18);
  expect(answer).toBe(a - b);
  expect(answer).toBeGreaterThanOrEqual(1);
  expect(answer).toBeLessThanOrEqual(9);
  await expect(page.locator('#a .cell')).toHaveCount(2);
  await expect(page.locator('#a')).toHaveText(String(a));
  await expect(page.locator('#b')).toHaveText(String(b));
  await expect(page.locator('#status')).toHaveText(`Question 1 of 20: ${a} minus ${b}`);
  await expect(page.locator('.crumbs .here')).toHaveText('Subtraction 2');
  await setProblem(page, 13, 5);
  await page.evaluate(() => window.mathtime.view.announceProblem(window.mathtime.game.state));
  await expect(page.locator('#status')).toHaveText('Question 1 of 20: 13 minus 5');
});

test('the box takes one digit: a second is ignored, and the caret hides', async ({ page }) => {
  await setProblem(page, 13, 5);
  await expect(page.locator('#ans')).toHaveAttribute('maxlength', '1');
  await expect(page.locator('.caret')).toBeVisible();
  await typeKeys(page, ['8', '1']);
  await expect(page.locator('#shown')).toHaveText('8');
  await expect(page.locator('#slot')).toHaveClass(/\bfull\b/);
  await expect(page.locator('.caret')).toBeHidden();
});

test('a wrong answer costs a life, and a right one moves on to another subtraction past 10', async ({ page }) => {
  await setProblem(page, 13, 5);
  await typeKeys(page, ['7', 'Enter']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  await expect(page.locator('#shown')).toHaveText('');
  await typeKeys(page, ['8', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  const { a, b, answer } = await page.evaluate(() => window.mathtime.game.state.problem);
  expect(a).toBeGreaterThanOrEqual(10);
  expect(answer).toBe(a - b);
  expect(answer).toBeLessThanOrEqual(9);
  await expect(page.locator('#status')).toHaveText(`Question 2 of 20: ${a} minus ${b}`);
});

// Level 3, then Level 2: the first number and the box are each level's own.
test('back on Level 2 after Level 3, the first number and the box are its own again', async ({ page }) => {
  const boxW = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#eq')).getPropertyValue('--box-w')));
  const play = n => page.evaluate(n => window.mathtime.play(window.mathtime.levels.find(l => l.n === n)), n);
  const levelThree = await boxW();
  await play(2);
  await expect(page.locator('.crumbs .here')).toHaveText('Subtraction 1');
  await expect(page.locator('#a .cell')).toHaveCount(1);
  await expect(page.locator('#ans')).toHaveAttribute('maxlength', '1');
  const levelTwo = await boxW();
  await open(page, 2);                                   // Level 2 fresh, from the selector
  expect(await boxW(), 'as when Level 2 is first chosen').toBe(levelTwo);
  await play(3);
  expect(await boxW(), 'Level 3 measures its own again').toBe(levelThree);
  await expect(page.locator('#a .cell')).toHaveCount(2);
});

test.describe('alignment', () => {
  test.beforeEach(async ({ page }) => {
    await freeze(page);
  });

  test('the box fits one digit, a little taller than wide', async ({ page }) => {
    const box = await boxEdges(page, await capture(page));
    const ratio = (box.right - box.left) / (box.bottom - box.top);
    note('box width / height', ratio, '');
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(0.9);
  });

  test('the box and "−" are centred on the digit ink', async ({ page }) => {
    const digits = await digitBand(page);
    await setProblem(page, 13, 5);
    const shot = await capture(page);
    const box = await boxEdges(page, shot);
    note('box offset', box.midY - digits.mid);
    expect(Math.abs(box.midY - digits.mid)).toBeLessThanOrEqual(TOL);
    const minus = ink(shot, await rect(page, '#eq .op', 0), MUTED);
    note('"−" offset', minus.midY - digits.mid);
    expect(Math.abs(minus.midY - digits.mid)).toBeLessThanOrEqual(TOL);
  });

  // The first number's second digit is drawn in its own cell, at a fraction
  // of a pixel: an "8" there, the second number's and the answer's must
  // share their ink top and foot exactly.
  test('the two-digit number sits on the problem\'s baseline, as the answer does', async ({ page }) => {
    await setProblem(page, 18, 8);
    await showAnswer(page, '8');
    const { inner } = await boxInside(page);
    const shot = await capture(page);
    const cell = await rect(page, '#a .cell', 1);                // the first number's "8"
    const eight = ink(shot, { ...cell, top: cell.top - 4, bottom: cell.bottom + 4 });
    const second = await digitInk(page, shot, '#b');
    const answer = ink(shot, inner);
    // As in alignment.spec.js: 0.05 still catches a single device pixel at 2x.
    const EXACT = 0.05;
    for (const [name, other] of [['second number', second], ['answer', answer]]) {
      expect(Math.abs(eight.bottom - other.bottom), `ink foot vs the ${name}`).toBeLessThanOrEqual(EXACT);
      expect(Math.abs(eight.top - other.top), `ink top vs the ${name}`).toBeLessThanOrEqual(EXACT);
    }
  });

  test('every answer, 1 to 9, is ink-centred in the box', async ({ page }) => {
    const { inner, centre } = await boxInside(page);
    for (let n = 1; n <= 9; n++) {
      await showAnswer(page, String(n));
      const answer = ink(await capture(page), inner);
      expect(Math.abs(answer.midX - centre), `answer ${n}`).toBeLessThanOrEqual(TOL);
    }
  });

  // The box wraps the widest answer in equal padding: across, its ink; up and
  // down, the digit ink band (all ten digits).
  test('the widest answer has the same padding on all four sides', async ({ page }) => {
    const pad = 0.17 * await fontSize(page);
    const digits = await digitBand(page);
    const { bw, outer, inner } = await boxInside(page);
    let widest = null;
    for (let n = 1; n <= 9; n++) {
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
    const sides = Object.values(gaps);
    const spread = Math.max(...sides) - Math.min(...sides);
    note('padding spread', spread);
    expect(spread, `answer ${widest.n}, padding spread`).toBeLessThanOrEqual(TOL);
    for (const [side, gap] of Object.entries(gaps)) {
      expect(Math.abs(gap - pad), `answer ${widest.n}, ${side} padding`).toBeLessThanOrEqual(1);
    }
  });

  test('the caret is centred in the empty box', async ({ page }) => {
    const { centre } = await boxInside(page);
    await showAnswer(page, '');
    const caret = await rect(page, '.caret');
    expect(Math.abs(caret.left + caret.width / 2 - centre)).toBeLessThanOrEqual(TOL);
  });

  test('what you see of the equation is centred, for every first number from 10 to 18', async ({ page }) => {
    await showOutline(page);
    let worst = 0;
    for (let a = 10; a <= 18; a++) {
      await layOut(page, a, 9);
      const off = (await groupOffset(page)).offset;
      worst = Math.max(worst, Math.abs(off));
      expect(Math.abs(off), `${a} − 9: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
    }
    note('worst centring', worst);
  });

  test('"Question N" has its ink centred over what you see', async ({ page }) => {
    await showOutline(page);
    for (const [question, a] of [[1, 13], [10, 18], [18, 11]]) {
      await page.evaluate(n => { window.mathtime.game.state.question = n; }, question);
      await setProblem(page, a, 9);
      const { first, outline, shot } = await groupOffset(page);
      const off = (await labelInk(page, shot)).midX - (first.left + outline.right) / 2;
      expect(Math.abs(off), `Question ${question}, ${a} − 9: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
    }
  });

  test('the ink gap from "=" to the box matches the mean ink gap around the second number', async ({ page }) => {
    const { mean, gap } = await equalsGap(page);
    note('mean digit gap', mean);
    note('"=" → box gap', gap);
    expect(Math.abs(gap - mean)).toBeLessThanOrEqual(TOL);
  });
});

// The equation's fit and place as they stand.
const fitNow = page => page.evaluate(() => {
  const eq = document.querySelector('#eq');
  return { size: eq.style.fontSize, left: eq.style.left };
});

// Choose Level `n` on the selector. Returns the fit the click left (this
// listener runs after the game's own), and the fit once the layout that
// comes when the problem area appears has run.
async function chooseAndFit(page, n) {
  await page.evaluate(n => {
    document.querySelector(`.select .row[data-level="${n}"]`).addEventListener('click', () => {
      const eq = document.querySelector('#eq');
      window.fitAtClick = { size: eq.style.fontSize, left: eq.style.left };
    }, { once: true });
  }, n);
  await levelRow(page, n).click();
  await settle(page);
  return { atClick: await page.evaluate(() => window.fitAtClick), settled: await fitNow(page) };
}

test.describe('the fit', () => {
  test('a narrow screen shrinks the two-digit equation to fit between 16px gutters', async ({ page }) => {
    await freeze(page);
    await resize(page, 280, 700);
    await layOut(page, 18, 9);
    expect(await fontSize(page), 'shrunk to fit').toBeLessThan(await cssFontSize(page));
    await showOutline(page);
    const shot = await capture(page);
    const first = await digitInk(page, shot, '#a');
    const outline = await outlineEdges(page, shot);
    const stage = await rect(page, '.stage');
    note('left gutter', first.left - stage.left);
    note('right gutter', stage.right - outline.right);
    expect(first.left - stage.left, 'left gutter').toBeGreaterThanOrEqual(16 - 0.01);
    expect(stage.right - outline.right, 'right gutter').toBeGreaterThanOrEqual(16 - 0.01);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'no horizontal scroll').toBeLessThanOrEqual(0);
  });

  // As a restarted game is centred from its first frame (polish.spec.js):
  // a level starts with the last level's problem still drawn, one digit or
  // two, and its fit must not wait for the layout that comes after.
  test('chosen on a narrow screen, Level 3 is fitted for its two digits from the first frame', async ({ page }) => {
    await page.goto('/');                                   // the selector, with index.html's one-digit 7 drawn
    await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
    await resize(page, 280, 700);
    const { atClick, settled } = await chooseAndFit(page, 3);
    expect(settled.size, 'precondition: two digits shrink the font at 280px').not.toBe('');
    expect(atClick).toEqual(settled);
  });

  test('after Level 3, Level 1 is fitted for its one digit from the first frame', async ({ page }) => {
    await resize(page, 280, 700);
    await page.keyboard.press('Escape');                    // to the selector, Level 3's two digits drawn
    await expect(page.locator('.select')).toBeVisible();
    const { atClick, settled } = await chooseAndFit(page, 1);
    expect(settled.size, 'precondition: Level 1 shrinks at 280px too').not.toBe('');
    expect(atClick).toEqual(settled);
  });
});
