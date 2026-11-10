import { test, expect } from './fixtures.js';
import {
  open, levelRow, freeze, resize, setProblem, layOut, rect, capture, ink, digitInk, digitBand,
  boxEdges, boxInside, borderInner, showAnswer, groupOffset, equalsGap, labelInk, note, fontSize,
  cssFontSize, typeKeys, finishRun, TOL, MUTED,
} from './helpers.js';

// Level 5, division facts (Levels 3–5 batch plan). Its play screen is
// Level 3's with "÷" for "−": a first number of one digit or two (0 to
// 81), a one-digit second number and a one-digit box. Every alignment row
// of the Level 1 spec §6 applies; the rows the operator or the first number
// change are measured here, on 56 ÷ 8, 81 ÷ 9 and 0 ÷ 1.

const PROBLEMS = [[56, 8], [81, 9], [0, 1]];

test.beforeEach(async ({ page }) => {
  await open(page, 5);
});

test('chosen from the selector, Level 5 asks a division fact, and screen readers hear it: "56 divided by 8"', async ({ page }) => {
  await expect(page.locator('#eq .op').first()).toHaveText('÷');
  await expect(page.locator('#eq .op').nth(1)).toHaveText('=');
  const { a, b, answer } = await page.evaluate(() => window.mathtime.game.state.problem);
  expect(b).toBeGreaterThanOrEqual(1);
  expect(b).toBeLessThanOrEqual(9);
  expect(Number.isInteger(answer)).toBe(true);
  expect(answer).toBe(a / b);
  expect(answer).toBeGreaterThanOrEqual(0);
  expect(answer).toBeLessThanOrEqual(9);
  await expect(page.locator('#a .cell')).toHaveCount(String(a).length);
  await expect(page.locator('#a')).toHaveText(String(a));
  await expect(page.locator('#b')).toHaveText(String(b));
  await expect(page.locator('#status')).toHaveText(`Question 1 of 20: ${a} divided by ${b}`);
  await expect(page.locator('.crumbs .here')).toHaveText('Division 1');
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await setProblem(page, 56, 8);
  await expect(page.locator('#a .cell')).toHaveCount(2);
  await page.evaluate(() => window.mathtime.view.announceProblem(window.mathtime.game.state));
  await expect(page.locator('#status')).toHaveText('Question 1 of 20: 56 divided by 8');
});

test('the box takes one digit: a second is ignored, and the caret hides', async ({ page }) => {
  await setProblem(page, 56, 8);
  await expect(page.locator('#ans')).toHaveAttribute('maxlength', '1');
  await expect(page.locator('.caret')).toBeVisible();
  await typeKeys(page, ['7', '1']);
  await expect(page.locator('#shown')).toHaveText('7');
  await expect(page.locator('#slot')).toHaveClass(/\bfull\b/);
  await expect(page.locator('.caret')).toBeHidden();
});

test('a wrong answer costs a life, and a right one moves on to another division fact', async ({ page }) => {
  await setProblem(page, 56, 8);
  await typeKeys(page, ['8', 'Enter']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  await expect(page.locator('#shown')).toHaveText('');
  await typeKeys(page, ['7', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  const { a, b, answer } = await page.evaluate(() => window.mathtime.game.state.problem);
  expect(answer).toBe(a / b);
  await expect(page.locator('#status')).toHaveText(`Question 2 of 20: ${a} divided by ${b}`);
});

test('a run of 20 finishes on the finish screen, and Level 5\'s row is marked finished', async ({ page }) => {
  await finishRun(page);
  await expect(page.getByRole('region', { name: 'Division 1 complete', exact: true })).toBeVisible();
  await expect(page.locator('.finish .done-title')).toHaveText('Division 1 complete');
  const time = await page.locator('.finish .done-time').textContent();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.runs')));
  expect(kept.map(r => r.level)).toEqual([5]);
  expect(kept[0].problems).toHaveLength(20);
  await page.locator('.finish .levels').click();
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 5)).toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 5).locator('.best')).toHaveText(time);
  await expect(levelRow(page, 5)).toHaveAttribute('aria-label', `Division, Level 1: Division facts. Finished, best ${time}.`);
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

  test('the box and "÷" are centred on the digit ink: 56 ÷ 8, 81 ÷ 9, 0 ÷ 1', async ({ page }) => {
    const digits = await digitBand(page);
    for (const [a, b] of PROBLEMS) {
      await setProblem(page, a, b);
      const shot = await capture(page);
      const box = await boxEdges(page, shot);
      note(`${a} ÷ ${b}: box offset`, box.midY - digits.mid);
      expect(Math.abs(box.midY - digits.mid), `${a} ÷ ${b}: box`).toBeLessThanOrEqual(TOL);
      const divide = ink(shot, await rect(page, '#eq .op', 0), MUTED);
      note(`${a} ÷ ${b}: "÷" offset`, divide.midY - digits.mid);
      expect(Math.abs(divide.midY - digits.mid), `${a} ÷ ${b}: "÷"`).toBeLessThanOrEqual(TOL);
    }
  });

  // The first number's second digit is drawn in its own cell, at a fraction
  // of a pixel: an "8" there, the second number's and the answer's must
  // share their ink top and foot exactly (48 ÷ 8, an "8" in the box).
  test('a two-digit first number sits on the problem\'s baseline, as the answer does', async ({ page }) => {
    await setProblem(page, 48, 8);
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

  test('every answer, 0 to 9, is ink-centred in the box', async ({ page }) => {
    const { inner, centre } = await boxInside(page);
    for (let n = 0; n <= 9; n++) {
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
    for (let n = 0; n <= 9; n++) {
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

  test('what you see of the equation is centred, one-digit first number or two: 56 ÷ 8, 81 ÷ 9, 0 ÷ 1', async ({ page }) => {
    // From the first digit's ink to the box's border (to its dashed outline
    // until that was removed, 2026-11-06).
    for (const [a, b] of PROBLEMS) {
      await layOut(page, a, b);
      const off = (await groupOffset(page)).offset;
      note(`${a} ÷ ${b} centring`, off);
      expect(Math.abs(off), `${a} ÷ ${b}: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
    }
  });

  test('"Question N" has its ink centred over what you see', async ({ page }) => {
    // Over the first digit's ink to the box's border (to its dashed outline
    // until that was removed, 2026-11-06).
    for (const [question, [a, b]] of [[1, PROBLEMS[0]], [10, PROBLEMS[1]], [18, PROBLEMS[2]]]) {
      await page.evaluate(n => { window.mathtime.game.state.question = n; }, question);
      await setProblem(page, a, b);
      const { first, box, shot } = await groupOffset(page);
      const off = (await labelInk(page, shot)).midX - (first.left + box.right) / 2;
      expect(Math.abs(off), `Question ${question}, ${a} ÷ ${b}: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
    }
  });

  test('the ink gap from "=" to the box matches the mean ink gap around the second number', async ({ page }) => {
    const { mean, gap } = await equalsGap(page);
    note('mean digit gap', mean);
    note('"=" → box gap', gap);
    expect(Math.abs(gap - mean)).toBeLessThanOrEqual(TOL);
  });
});

test('a narrow screen shrinks 81 ÷ 9 to fit between 16px gutters', async ({ page }) => {
  await freeze(page);
  await resize(page, 280, 700);
  await layOut(page, 81, 9);
  expect(await fontSize(page), 'shrunk to fit').toBeLessThan(await cssFontSize(page));
  // The right gutter is to the box's border (to its dashed outline until
  // that was removed, 2026-11-06).
  const shot = await capture(page);
  const first = await digitInk(page, shot, '#a');
  const box = await boxEdges(page, shot);
  const stage = await rect(page, '.stage');
  note('left gutter', first.left - stage.left);
  note('right gutter', stage.right - box.right);
  expect(first.left - stage.left, 'left gutter').toBeGreaterThanOrEqual(16 - 0.01);
  expect(stage.right - box.right, 'right gutter').toBeGreaterThanOrEqual(16 - 0.01);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'no horizontal scroll').toBeLessThanOrEqual(0);
});
