import { test, expect } from '@playwright/test';
import {
  open, freeze, showOutline, setProblem, layOut, rect, capture, ink, digitBand, boxEdges, boxInside, borderInner,
  showAnswer, groupOffset, equalsGap, note, fontSize, typeKeys, TOL, MUTED,
} from './helpers.js';

// Level 2, subtraction within 10 (Level 2 spec §1, §2). Its play screen is
// Level 1's with "−", and every alignment row of the Level 1 spec §6 applies
// to it (Level 2 spec §5). The rows that depend on the level are measured
// here: the operator, the box, the answers, and the centring the box changes.

test.beforeEach(async ({ page }) => {
  await open(page, 2);
});

test('Level 2 asks a − b with the minus sign, and screen readers hear "minus"', async ({ page }) => {
  await expect(page.locator('#eq .op').first()).toHaveText('−');
  await expect(page.locator('#eq .op').nth(1)).toHaveText('=');
  const { a, b } = await page.evaluate(() => window.mathtime.game.state.problem);
  expect(b).toBeLessThanOrEqual(a);
  await expect(page.locator('#a')).toHaveText(String(a));
  await expect(page.locator('#b')).toHaveText(String(b));
  await expect(page.locator('#status')).toHaveText(`Question 1: ${a} minus ${b}`);
  await expect(page.locator('.crumbs .topic')).toHaveText('Subtraction');
  await expect(page.locator('.crumbs .here')).toHaveText('Level 2');
});

test('the box takes one digit: a second is ignored, and the caret hides', async ({ page }) => {
  await setProblem(page, 7, 3);
  await expect(page.locator('#ans')).toHaveAttribute('maxlength', '1');
  await expect(page.locator('.caret')).toBeVisible();
  await typeKeys(page, ['4', '5']);
  await expect(page.locator('#shown')).toHaveText('4');
  await expect(page.locator('#slot')).toHaveClass(/\bfull\b/);
  await expect(page.locator('.caret')).toBeHidden();
});

test('a wrong answer costs a life, and a right one moves on to another subtraction', async ({ page }) => {
  await setProblem(page, 7, 3);
  await typeKeys(page, ['5', 'Enter']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  await expect(page.locator('#shown')).toHaveText('');
  await typeKeys(page, ['4', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  const { a, b } = await page.evaluate(() => window.mathtime.game.state.problem);
  expect(b).toBeLessThanOrEqual(a);
});

test.describe('alignment', () => {
  test.beforeEach(async ({ page }) => {
    await freeze(page);
  });

  test('the box fits one digit, a little taller than wide, and each level measures its own', async ({ page }) => {
    const boxW = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#eq')).getPropertyValue('--box-w')));
    const one = await boxW();
    const box = await boxEdges(page, await capture(page));
    const ratio = (box.right - box.left) / (box.bottom - box.top);
    note('box width / height', ratio);
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(0.9);
    await page.evaluate(() => window.mathtime.play(window.mathtime.levels[0]));
    expect(await boxW(), 'Level 1 fits "18"').toBeGreaterThan(1.5 * one);
    await page.evaluate(() => window.mathtime.play(window.mathtime.levels[1]));
    expect(await boxW()).toBe(one);
  });

  test('the box and "−" are centred on the digit ink', async ({ page }) => {
    const digits = await digitBand(page);
    const shot = await capture(page);
    const box = await boxEdges(page, shot);
    note('box offset', box.midY - digits.mid);
    expect(Math.abs(box.midY - digits.mid)).toBeLessThanOrEqual(TOL);
    const minus = ink(shot, await rect(page, '#eq .op', 0), MUTED);
    note('"−" offset', minus.midY - digits.mid);
    expect(Math.abs(minus.midY - digits.mid)).toBeLessThanOrEqual(TOL);
  });

  test('every answer, 0 to 9, is ink-centred in the box', async ({ page }) => {
    const { inner, centre } = await boxInside(page);
    for (let n = 0; n <= 9; n++) {
      await showAnswer(page, String(n));
      const answer = ink(await capture(page), inner);
      expect(Math.abs(answer.midX - centre), `answer ${n}`).toBeLessThanOrEqual(TOL);
    }
  });

  // The box wraps the widest digit in equal padding: across, its ink; up and
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

  test('what you see of the equation is centred, for every first digit', async ({ page }) => {
    await showOutline(page);
    for (let a = 0; a <= 9; a++) {
      await layOut(page, a, 0);
      const off = (await groupOffset(page)).offset;
      expect(Math.abs(off), `${a} − 0: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
    }
  });

  test('the ink gap from "=" to the box matches the mean ink gap around the second number', async ({ page }) => {
    const { mean, gap } = await equalsGap(page);
    note('mean digit gap', mean);
    note('"=" → box gap', gap);
    expect(Math.abs(gap - mean)).toBeLessThanOrEqual(TOL);
  });
});
