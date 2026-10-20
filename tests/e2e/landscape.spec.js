import { test, expect } from '@playwright/test';
import {
  open, freeze, showOutline, resize, setProblem, rect, capture, ink, digitBand, boxEdges, groupOffset,
  equalsGap, clearances, keyLabelOffsets, labelInk, note, fontSize, cssFontSize, TOL, MUTED,
} from './helpers.js';

// Phones held sideways (spec §3.4): the keypad beside the problem area, and
// every alignment rule of §6 in the problem area's column. On the phone
// project the size is a CDP override on top of a real 2x window, which keeps
// the 2x; the desktop project checks the same sizes at 1x.
const keys = page => page.evaluate(() => [...document.querySelectorAll('.pad button')].map(b => {
  const r = b.getBoundingClientRect();
  return { k: b.dataset.k, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
}));

for (const [width, height] of [[667, 375], [844, 390], [568, 320], [740, 360], [896, 414], [932, 430]]) {
  test.describe(`landscape ${width}×${height}`, () => {
    test.beforeEach(async ({ page }) => {
      await open(page);
      await freeze(page);
      await resize(page, width, height);
    });

    test('the keypad is beside the problem area, keys 40-64px tall in proportion', async ({ page }) => {
      const stage = await rect(page, '.stage');
      const top = await rect(page, '.top');
      const pad = await keys(page);
      note('font size', await fontSize(page));
      note('key height', pad[0].height);
      // The problem area: the full height below the full-width header.
      expect(top.width).toBe(width);
      expect(Math.abs(stage.top - top.bottom), 'problem area under the header').toBeLessThanOrEqual(0.01);
      expect(Math.abs(stage.bottom - height), 'problem area to the bottom').toBeLessThanOrEqual(0.01);
      expect(stage.left).toBe(0);
      // The keypad: right of it, in the same 3×4 order, 16px from the right edge.
      const left = Math.min(...pad.map(k => k.left));
      expect(left, 'keypad right of the problem area').toBeGreaterThanOrEqual(stage.right - 0.01);
      expect(pad.map(k => k.k).join(' ')).toBe('1 2 3 4 5 6 7 8 9 Backspace 0 Enter');
      // The rows share the height below the header, less 16px above and
      // below and three 8px gaps, up to 64px each.
      const keyH = Math.min(64, (height - top.bottom - 16 - 16 - 24) / 4);
      pad.forEach((k, i) => {
        expect(Math.abs(k.left - pad[i % 3].left), `${k.k} column`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(k.top - pad[3 * Math.floor(i / 3)].top), `${k.k} row`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(k.height - keyH), `${k.k} height`).toBeLessThanOrEqual(0.01);
        expect(k.height, `${k.k} height`).toBeGreaterThanOrEqual(40);
        expect(Math.abs(k.width / k.height - 1.5), `${k.k} width : height`).toBeLessThanOrEqual(0.01);
      });
      expect(Math.abs(width - Math.max(...pad.map(k => k.right)) - 16), 'right gutter').toBeLessThanOrEqual(0.5);
      const padTop = Math.min(...pad.map(k => k.top)), padBottom = Math.max(...pad.map(k => k.bottom));
      expect(padTop - top.bottom, 'room below the header').toBeGreaterThanOrEqual(16 - 0.5);
      expect(height - padBottom, 'bottom gutter').toBeGreaterThanOrEqual(16 - 0.5);
      // Centred in its band, which shares the problem area's centre.
      note('keypad centre below the problem area\'s', (padTop + padBottom) / 2 - (stage.top + stage.bottom) / 2);
      expect(Math.abs((padTop + padBottom) / 2 - (stage.top + stage.bottom) / 2), 'keypad centre').toBeLessThanOrEqual(0.5);
    });

    test('the equation keeps the alignment rules in its column', async ({ page }) => {
      const stage = await rect(page, '.stage');
      const digits = await digitBand(page);
      const shot = await capture(page);
      // Box and operators on the digit ink; the digit ink centred in the column.
      const box = await boxEdges(page, shot);
      expect(Math.abs(box.midY - digits.mid), 'box').toBeLessThanOrEqual(TOL);
      for (const i of [0, 1]) {
        const op = ink(shot, await rect(page, '.op', i), MUTED);
        expect(Math.abs(op.midY - digits.mid), ['"+"', '"="'][i]).toBeLessThanOrEqual(TOL);
      }
      expect(Math.abs(digits.mid - (stage.top + stage.bottom) / 2), 'digit ink centre').toBeLessThanOrEqual(TOL);
      // The caret reaches the digit ink at both ends, never short.
      const caret = await rect(page, '.caret');
      const dpr = await page.evaluate(() => devicePixelRatio);
      expect(caret.top).toBeLessThanOrEqual(digits.top + 0.01);
      expect(caret.top).toBeGreaterThan(digits.top - 1 / dpr - 0.01);
      expect(caret.bottom).toBeGreaterThanOrEqual(digits.bottom - 0.01);
      expect(caret.bottom).toBeLessThan(digits.bottom + 1 / dpr + 0.01);
      // Even spacing before the box.
      const { mean, gap } = await equalsGap(page);
      note('"=" → box gap less the mean', gap - mean);
      expect(Math.abs(gap - mean), '"=" gap').toBeLessThanOrEqual(TOL);
      // What you see is centred in the column, whatever the first digit.
      await showOutline(page);
      let worst = 0, label = 0;
      for (let a = 0; a <= 9; a++) {
        await setProblem(page, a, 5);
        const { offset, first, outline, shot } = await groupOffset(page);
        worst = Math.max(worst, Math.abs(offset));
        expect(Math.abs(offset), `a = ${a}: ${offset.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
        // "Question N"'s ink over the same middle.
        label = Math.max(label, Math.abs((await labelInk(page, shot)).midX - (first.left + outline.right) / 2));
      }
      note('worst centring', worst);
      note('worst label centring', label);
      expect(label, '"Question N" centring').toBeLessThanOrEqual(TOL);
    });

    test('"Question N" and the box clear the column by 8px, inside its gutters, with no scroll', async ({ page }) => {
      await showOutline(page);
      const { above, below } = await clearances(page);
      expect(above, '"Question N" shows').not.toBeNull();
      note('"Question N" ink below the top', above);
      note('outline ink above the bottom', below);
      expect(above, '"Question N" clear above').toBeGreaterThanOrEqual(8);
      expect(below, 'box clear below').toBeGreaterThanOrEqual(8);
      // Gutters: phone gutters (16px) on what you see, outline included.
      const { first, outline } = await groupOffset(page);
      const stage = await rect(page, '.stage');
      note('left gutter', first.left - stage.left);
      note('right gutter', stage.right - outline.right);
      expect(first.left - stage.left, 'left gutter').toBeGreaterThanOrEqual(16 - 0.01);
      expect(stage.right - outline.right, 'right gutter').toBeGreaterThanOrEqual(16 - 0.01);
      const scroll = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - innerWidth,
        y: document.documentElement.scrollHeight - innerHeight,
      }));
      expect(scroll).toEqual({ x: 0, y: 0 });
      // It uses the column: the equation is no longer squeezed for height.
      const fs = await fontSize(page);
      expect(fs, 'font size').toBeGreaterThanOrEqual(40);
      // Shrunk for width only as far as phone gutters need: with the 1px
      // slack and the first digit's side bearing, they end up 16.5-20px.
      if (fs < await cssFontSize(page) - 0.01) {
        expect(Math.min(first.left - stage.left, stage.right - outline.right), 'tightest gutter once shrunk').toBeLessThan(20);
      }
    });

    test('keypad labels are centred on their ink at this key size', async ({ page }) => {
      const { across, down } = await keyLabelOffsets(page);
      note('worst label offset across', across);
      note('worst label offset down', down);
      expect(across).toBeLessThanOrEqual(TOL);
      expect(down).toBeLessThanOrEqual(TOL);
    });
  });
}

test('the level selector uses the whole width in landscape', async ({ page }) => {
  await open(page);
  await resize(page, 667, 375);
  await page.evaluate(() => document.body.classList.add('at-select'));
  const button = await rect(page, '#level1');
  expect(Math.abs(button.left + button.width / 2 - 667 / 2), 'centred across the screen').toBeLessThanOrEqual(0.5);
});

// Landscape but nearly square (spec §3.4 is for screens at least 3:2): the
// side keypad would leave the equation a sliver, so the keypad stays below.
for (const [width, height] of [[420, 390], [561, 560]]) {
  test(`a near-square ${width}×${height} window keeps the keypad below the problem`, async ({ page }) => {
    await open(page);
    await resize(page, width, height);
    const stage = await rect(page, '.stage');
    const pad = await rect(page, '.pad');
    note('font size', await fontSize(page));
    expect(pad.top, 'keypad below the problem area').toBeGreaterThanOrEqual(stage.bottom - 0.01);
    expect(stage.width, 'problem area across the screen').toBe(width);
    expect(await fontSize(page), 'font size').toBeGreaterThanOrEqual(25);
  });
}
