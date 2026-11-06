import { test, expect } from '@playwright/test';
import {
  open, levelRow, freeze, showOutline, resize, setProblem, layOut, rect, capture, ink, digitInk, digitBand,
  boxEdges, boxInside, borderInner, outlineEdges, showAnswer, groupOffset, equalsGap, labelInk, note, fontSize,
  cssFontSize, typeKeys, finishRun, TOL, MUTED,
} from './helpers.js';
import { LEVEL4 } from '../../src/level4.js';

// Level 4, times tables (Levels 3–5 batch plan). Its play screen is Level
// 1's with "×" for "+": one-digit numbers and a two-digit answer box, sized
// for the products 0 to 81. Every alignment row of the Level 1 spec §6
// applies; the rows the operator or the answers change are measured here,
// on 6 × 7, 9 × 9 (typed "81"), 0 × 0 and 1 × 1.

const PROBLEMS = [[6, 7], [9, 9], [0, 0], [1, 1]];

test.beforeEach(async ({ page }) => {
  await open(page, 4);
});

test('chosen from the selector, Level 4 asks a times-table fact, and screen readers hear it: "6 times 7"', async ({ page }) => {
  await expect(page.locator('#eq .op').first()).toHaveText('×');
  await expect(page.locator('#eq .op').nth(1)).toHaveText('=');
  const { a, b, answer } = await page.evaluate(() => window.mathtime.game.state.problem);
  for (const n of [a, b]) {
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(9);
  }
  expect(answer).toBe(a * b);
  await expect(page.locator('#a .cell')).toHaveCount(1);
  await expect(page.locator('#a')).toHaveText(String(a));
  await expect(page.locator('#b')).toHaveText(String(b));
  await expect(page.locator('#status')).toHaveText(`Question 1 of 20: ${a} times ${b}`);
  await expect(page.locator('.crumbs .here')).toHaveText('Multiplication 1');
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await setProblem(page, 6, 7);
  await page.evaluate(() => window.mathtime.view.announceProblem(window.mathtime.game.state));
  await expect(page.locator('#status')).toHaveText('Question 1 of 20: 6 times 7');
});

test('the box takes two digits: it is full after the second, a third is ignored, and the caret hides', async ({ page }) => {
  await setProblem(page, 9, 9);
  await expect(page.locator('#ans')).toHaveAttribute('maxlength', '2');
  await typeKeys(page, ['8']);
  await expect(page.locator('#shown')).toHaveText('8');
  await expect(page.locator('#slot')).not.toHaveClass(/\bfull\b/);
  await expect(page.locator('.caret')).toBeVisible();
  await typeKeys(page, ['1', '5']);
  await expect(page.locator('#shown')).toHaveText('81');
  await expect(page.locator('#ans')).toHaveValue('81');      // screen readers hear it
  await expect(page.locator('#slot')).toHaveClass(/\bfull\b/);
  await expect(page.locator('.caret')).toBeHidden();
});

test('nothing in the equation moves while a two-digit answer is typed', async ({ page }) => {
  await setProblem(page, 9, 9);
  const positions = () => Promise.all(['#a', '#b', '#slot', '#qnum'].map(s => rect(page, s))
    .concat([rect(page, '#eq .op', 0), rect(page, '#eq .op', 1)]));
  const before = await positions();
  await typeKeys(page, ['8']);
  expect(await positions(), 'after "8"').toEqual(before);
  await typeKeys(page, ['1']);
  expect(await positions(), 'after "81"').toEqual(before);
  await typeKeys(page, ['Backspace']);
  expect(await positions(), 'after deleting one').toEqual(before);
});

test('a wrong answer costs a life, and a right two-digit one moves on to another fact', async ({ page }) => {
  await setProblem(page, 9, 9);
  await typeKeys(page, ['7', '2', 'Enter']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  await expect(page.locator('#shown')).toHaveText('');
  await typeKeys(page, ['8', '1', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  const { a, b, answer } = await page.evaluate(() => window.mathtime.game.state.problem);
  expect(answer).toBe(a * b);
  await expect(page.locator('#status')).toHaveText(`Question 2 of 20: ${a} times ${b}`);
});

test('a run of 20 finishes on the finish screen, and Level 4\'s row is marked finished', async ({ page }) => {
  await finishRun(page);
  await expect(page.getByRole('region', { name: 'Multiplication 1 complete', exact: true })).toBeVisible();
  await expect(page.locator('.finish .done-title')).toHaveText('Multiplication 1 complete');
  const time = await page.locator('.finish .done-time').textContent();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.runs')));
  expect(kept.map(r => r.level)).toEqual([4]);
  expect(kept[0].problems).toHaveLength(20);
  await page.locator('.finish .levels').click();
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 4)).toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 4).locator('.best')).toHaveText(time);
  await expect(levelRow(page, 4)).toHaveAttribute('aria-label', `Multiplication, Level 1: Times tables. Finished, best ${time}.`);
});

test.describe('alignment', () => {
  test.beforeEach(async ({ page }) => {
    await freeze(page);
  });

  test('the box and "×" are centred on the digit ink: 6 × 7, 9 × 9, 0 × 0, 1 × 1', async ({ page }) => {
    const digits = await digitBand(page);
    for (const [a, b] of PROBLEMS) {
      await setProblem(page, a, b);
      const shot = await capture(page);
      const box = await boxEdges(page, shot);
      note(`${a} × ${b}: box offset`, box.midY - digits.mid);
      expect(Math.abs(box.midY - digits.mid), `${a} × ${b}: box`).toBeLessThanOrEqual(TOL);
      const times = ink(shot, await rect(page, '#eq .op', 0), MUTED);
      note(`${a} × ${b}: "×" offset`, times.midY - digits.mid);
      expect(Math.abs(times.midY - digits.mid), `${a} × ${b}: "×"`).toBeLessThanOrEqual(TOL);
    }
  });

  // A two-digit answer is one run of text in the box, drawn at a fraction
  // of a pixel: each of its digits must share its ink top and foot with the
  // same digit in the problem exactly. Its two glyphs fall either side of
  // the box's centre, so each is measured on its own half.
  test('"81" sits on the problem\'s baseline, each digit as the problem\'s', async ({ page }) => {
    await setProblem(page, 9, 9);
    await showAnswer(page, '81');
    const { inner, centre } = await boxInside(page);
    const digits = await digitBand(page);                       // 9 × 9 was drawn over by the band's pairs
    await setProblem(page, 9, 9);
    await showAnswer(page, '81');
    const whole = ink(await capture(page), inner);
    note('"81" top from the digit band', whole.top - digits.top);
    note('"81" foot from the digit band', whole.bottom - digits.bottom);
    expect(Math.abs(whole.top - digits.top), '9 × 9: "81" ink top on the digit band').toBeLessThanOrEqual(TOL);
    expect(Math.abs(whole.bottom - digits.bottom), '9 × 9: "81" ink foot on the digit band').toBeLessThanOrEqual(TOL);
    // The same glyphs in the problem: 8 × 1, with "81" typed.
    await setProblem(page, 8, 1);
    await showAnswer(page, '81');
    const shot = await capture(page);
    const eight = await digitInk(page, shot, '#a');
    const one = await digitInk(page, shot, '#b');
    const answerEight = ink(shot, { ...inner, right: centre });
    const answerOne = ink(shot, { ...inner, left: centre });
    // As in alignment.spec.js: 0.05 still catches a single device pixel at 2x.
    const EXACT = 0.05;
    for (const [name, problem, answer] of [['"8"', eight, answerEight], ['"1"', one, answerOne]]) {
      expect(Math.abs(answer.bottom - problem.bottom), `${name}: ink foot`).toBeLessThanOrEqual(EXACT);
      expect(Math.abs(answer.top - problem.top), `${name}: ink top`).toBeLessThanOrEqual(EXACT);
    }
  });

  test('every possible answer, 0 to 81, is ink-centred in the box', async ({ page }) => {
    const { inner, centre } = await boxInside(page);
    let worst = 0;
    for (const s of LEVEL4.possibleAnswers) {
      await showAnswer(page, s);
      const answer = ink(await capture(page), inner);
      worst = Math.max(worst, Math.abs(answer.midX - centre));
      expect(Math.abs(answer.midX - centre), `answer ${s}`).toBeLessThanOrEqual(TOL);
    }
    note('worst answer centring', worst);
  });

  // The box wraps the widest product in equal padding: across, its ink; up
  // and down, the digit ink band (all ten digits).
  test('the widest answer has the same padding on all four sides', async ({ page }) => {
    const pad = 0.17 * await fontSize(page);
    const digits = await digitBand(page);
    const { bw, outer, inner } = await boxInside(page);
    let widest = null;
    for (const s of LEVEL4.possibleAnswers) {
      await showAnswer(page, s);
      const shot = await capture(page);
      const answer = ink(shot, inner);
      if (!widest || answer.right - answer.left > widest.ink.right - widest.ink.left) widest = { s, ink: answer, shot };
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
    note(`padding spread (answer ${widest.s})`, spread);
    expect(spread, `answer ${widest.s}, padding spread`).toBeLessThanOrEqual(TOL);
    for (const [side, gap] of Object.entries(gaps)) {
      expect(Math.abs(gap - pad), `answer ${widest.s}, ${side} padding`).toBeLessThanOrEqual(1);
    }
  });

  test('the box fits two digits, wider than tall', async ({ page }) => {
    const box = await boxEdges(page, await capture(page));
    const ratio = (box.right - box.left) / (box.bottom - box.top);
    note('box width / height', ratio, '');
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(1.6);
  });

  test('the caret is centred in the empty box', async ({ page }) => {
    const { centre } = await boxInside(page);
    await showAnswer(page, '');
    const caret = await rect(page, '.caret');
    expect(Math.abs(caret.left + caret.width / 2 - centre)).toBeLessThanOrEqual(TOL);
  });

  test('what you see of the equation is centred: 6 × 7, 9 × 9, 0 × 0, 1 × 1', async ({ page }) => {
    await showOutline(page);
    for (const [a, b] of PROBLEMS) {
      await layOut(page, a, b);
      const off = (await groupOffset(page)).offset;
      note(`${a} × ${b} centring`, off);
      expect(Math.abs(off), `${a} × ${b}: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
    }
  });

  test('"Question N" has its ink centred over what you see', async ({ page }) => {
    await showOutline(page);
    for (const [question, [a, b]] of [[1, PROBLEMS[0]], [10, PROBLEMS[1]], [18, PROBLEMS[3]]]) {
      await page.evaluate(n => { window.mathtime.game.state.question = n; }, question);
      await setProblem(page, a, b);
      const { first, outline, shot } = await groupOffset(page);
      const off = (await labelInk(page, shot)).midX - (first.left + outline.right) / 2;
      expect(Math.abs(off), `Question ${question}, ${a} × ${b}: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
    }
  });

  test('the ink gap from "=" to the box matches the mean ink gap around the second number', async ({ page }) => {
    const { mean, gap } = await equalsGap(page);
    note('mean digit gap', mean);
    note('"=" → box gap', gap);
    expect(Math.abs(gap - mean)).toBeLessThanOrEqual(TOL);
  });
});

test('a narrow screen shrinks 9 × 9 = 81 to fit between 16px gutters', async ({ page }) => {
  await freeze(page);
  await resize(page, 280, 700);
  await layOut(page, 9, 9);
  await showAnswer(page, '81');
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
