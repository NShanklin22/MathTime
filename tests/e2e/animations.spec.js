import { test, expect } from '@playwright/test';
import { open, setProblem, setColumns, typeKeys, boardCell, written, note } from './helpers.js';

// The feedback animations (docs/superpowers/specs/2026-11-06-animations-mockup.html,
// "New"): inked over and the in-place reprint on a right answer, the
// red-line on a wrong one, and their end states at once under reduced
// motion. On every level kind: the answer box (Levels 1-5) and the column
// board (Levels 6-7).

const GOOD = 'rgb(143, 240, 192)';
const RED = 'rgb(255, 138, 122)';            // --redline
const INK = 'rgb(238, 245, 255)';
const TIME_TOL = 40;
function near(ms, target, what = '') {
  note(`${what}${target}ms`, ms, 'ms');
  expect(Math.abs(ms - target), `${what}${ms.toFixed(1)}ms, expected ${target}±${TIME_TOL}ms`).toBeLessThanOrEqual(TIME_TOL);
}

// Runs in the page: press `key` on the answer field, as the keyboard does.
const PRESS = `window.pressKey = key => document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));`;

// In the page: from Enter, until the next problem has faded in (or `ms`),
// every frame's transform on `sel` and whether the next problem was
// swapped in, and when; with probes run at the given times (ms after Enter).
const watchRight = (page, sel, probes = {}) => page.evaluate(([sel, probes, PRESS]) => new Promise(resolve => {
  eval(PRESS);
  const el = document.querySelector(sel);
  const { game } = window.mathtime;
  const log = { transforms: new Set(), probes: {} };
  const next = game.next;
  game.next = () => { log.swap = performance.now() - log.t0; log.opacityAtSwap = getComputedStyle(el).opacity; next(); };
  const frame = () => {
    log.transforms.add(getComputedStyle(el).transform);
    if (performance.now() - log.t0 < 700) requestAnimationFrame(frame);
    else resolve({ ...log, transforms: [...log.transforms] });
  };
  for (const [name, ms] of Object.entries(probes)) setTimeout(() => { log.probes[name] = window.probe(); }, ms);
  log.t0 = performance.now();
  window.pressKey('Enter');
  requestAnimationFrame(frame);
}), [sel, probes, PRESS]);

// In the page: what the answer box shows, for the probes.
const probeBox = page => page.evaluate(() => {
  window.probe = () => {
    const slot = document.querySelector('#slot');
    const s = slot.getBoundingClientRect(), a = getComputedStyle(slot, '::after');
    const top = s.top + parseFloat(a.top);
    const pen = document.querySelector('svg.fx.pen');
    const r = pen?.getBoundingClientRect();
    return {
      frame: { left: s.left, right: s.right, top, bottom: top + parseFloat(a.height) },
      pen: r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null,
      penWidth: pen ? parseFloat(getComputedStyle(pen.querySelector('path')).strokeWidth) : null,
      bw: parseFloat(a.borderTopWidth),
      overlays: document.querySelectorAll('.fx').length,
      border: a.borderTopColor,
      digits: getComputedStyle(document.querySelector('#shown')).color,
      eq: document.querySelector('#eq').className,
      dpr: devicePixelRatio,
    };
  };
});

const onDevicePixel = (v, dpr) => Math.abs(v * dpr - Math.round(v * dpr)) < 0.02;
function expectFramed(p, what) {
  for (const k of ['left', 'right', 'top', 'bottom']) {
    expect(onDevicePixel(p.pen[k], p.dpr), `${what}: the pen's ${k} ${p.pen[k]} on a device pixel`).toBe(true);
    expect(Math.abs(p.pen[k] - p.frame[k]), `${what}: the pen's ${k} on the frame's`).toBeLessThanOrEqual(0.5 / p.dpr + 0.02);
  }
}

test.describe('Level 1, the answer box', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await setProblem(page, 3, 4);
  });

  test('a right answer is inked over, locks input 320ms and fades the next problem in where it sits, with no transform', async ({ page }) => {
    await probeBox(page);
    await typeKeys(page, ['7']);
    const log = await watchRight(page, '#eq', { start: 5, trace: 70, inked: 225 });
    near(log.swap, 320, 'lock ');
    expect(log.opacityAtSwap, 'faded out by the swap').toBe('0');
    expect(log.transforms, 'the equation never moves').toEqual(['none']);
    // Mid-trace: the pen over the box's frame, on whole device pixels; the border still white.
    const mid = log.probes.trace;
    expect(mid.pen, 'the pen line is drawn mid-trace').not.toBeNull();
    expectFramed(mid, 'mid-trace');
    expect(mid.border).toBe(INK);
    // The border is whole device pixels: the pen is exactly its width from
    // the start, so nothing changes weight when the border takes over.
    for (const p of [log.probes.start, mid]) expect(Math.abs(p.penWidth - p.bw), `pen ${p.penWidth}, border ${p.bw}`).toBeLessThan(0.01);
    expect(mid.eq).toMatch(/\bcorrect\b/);
    // The trace done: the box's own border green, the digits green, no overlay left.
    expect(log.probes.inked).toMatchObject({ overlays: 0, border: GOOD, digits: GOOD });
    expect(log.probes.inked.eq).toMatch(/\binked\b/);
    // The next problem: white again, at full opacity, no overlay.
    await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
    await expect(page.locator('#eq')).toHaveCSS('opacity', '1');
    await expect(page.locator('#eq')).toHaveClass('eq');
    await expect(page.locator('.fx')).toHaveCount(0);
  });

  test('a wrong answer is struck through by the red-line, which clears itself after 500ms, with no transform', async ({ page }) => {
    await typeKeys(page, ['9']);
    const log = await page.evaluate(PRESS => new Promise(resolve => {
      eval(PRESS);
      const eq = document.querySelector('#eq');
      const log = { transforms: new Set(), rects: new Set() };
      const t0 = performance.now();
      window.pressKey('Enter');
      const line = document.querySelector('svg.fx.redline');
      log.struck = { line: !!line, ghost: document.querySelector('.shown .ghost')?.textContent, shown: document.querySelector('#shown').textContent };
      const sw = line && parseFloat(line.querySelector('line:not(.halo)').getAttribute('stroke-width'));
      log.sw = sw * devicePixelRatio;
      log.fs = parseFloat(getComputedStyle(eq).fontSize) * devicePixelRatio;
      const frame = () => {
        log.transforms.add(getComputedStyle(eq).transform);
        const r = document.querySelector('#slot').getBoundingClientRect();
        log.rects.add(`${r.left},${r.top}`);
        if (!document.querySelector('svg.fx.redline') && !log.cleared) log.cleared = performance.now() - t0;
        if (performance.now() - t0 < 700) requestAnimationFrame(frame);
        else resolve({ ...log, transforms: [...log.transforms], rects: [...log.rects] });
      };
      requestAnimationFrame(frame);
    }), PRESS);
    expect(log.struck).toEqual({ line: true, ghost: '9', shown: '' });
    expect(Number.isInteger(Math.round(log.sw * 1000) / 1000), 'the strike is whole device pixels').toBe(true);
    expect(Math.abs(log.sw - 0.07 * log.fs)).toBeLessThanOrEqual(0.5 + 1e-6);
    near(log.cleared, 500, 'red-line ');
    expect(log.transforms).toEqual(['none']);
    expect(log.rects, 'nothing moves').toHaveLength(1);
    await expect(page.locator('.shown .ghost')).toHaveCount(0);
    await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  });

  test('a key during the red-line clears it at once and types the digit', async ({ page }) => {
    await typeKeys(page, ['9']);
    const after = await page.evaluate(PRESS => new Promise(resolve => {
      eval(PRESS);
      window.pressKey('Enter');
      setTimeout(() => {
        const before = !!document.querySelector('svg.fx.redline');
        window.pressKey('5');
        resolve({
          before,
          line: document.querySelectorAll('.fx').length,
          ghost: document.querySelectorAll('.shown .ghost').length,
          shown: document.querySelector('#shown').textContent,
          eq: document.querySelector('#eq').className,
        });
      }, 200);
    }), PRESS);
    expect(after).toEqual({ before: true, line: 0, ghost: 0, shown: '5', eq: 'eq' });
  });

  test.describe('under reduced motion', () => {
    test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

    test('a right answer shows inked at once, still locks 320ms, and the next problem shows at once', async ({ page }) => {
      await probeBox(page);
      await typeKeys(page, ['7']);
      const log = await watchRight(page, '#eq', { at: 10 });
      expect(log.probes.at).toMatchObject({ overlays: 0, border: GOOD, digits: GOOD, pen: null });
      near(log.swap, 320, 'lock ');
      expect(log.opacityAtSwap, 'nothing fades').toBe('1');
      expect(log.transforms).toEqual(['none']);
      expect(await page.evaluate(() => document.querySelector('#eq').getAnimations({ subtree: true })
        .filter(a => !(a instanceof CSSAnimation)).length)).toBe(0);
      await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
    });

    test('a wrong answer shows the strike still for 400ms, or until the next key', async ({ page }) => {
      await typeKeys(page, ['9']);
      const log = await page.evaluate(PRESS => new Promise(resolve => {
        eval(PRESS);
        const t0 = performance.now();
        window.pressKey('Enter');
        const line = document.querySelector('svg.fx.redline');
        const log = { line: !!line, moving: line ? line.getAnimations().length : -1 };
        const frame = () => {
          if (!document.querySelector('svg.fx.redline')) { log.cleared = performance.now() - t0; resolve(log); } else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }), PRESS);
      expect(log).toMatchObject({ line: true, moving: 0 });
      near(log.cleared, 400, 'still strike ');
      await typeKeys(page, ['8', 'Enter', '6']);
      await expect(page.locator('.fx')).toHaveCount(0);
      await expect(page.locator('#shown')).toHaveText('6');
    });
  });
});

// The board: the final answer's frames inked over as one, the problem
// reprinted in place; a wrong cell struck.
test.describe('the column board', () => {
  // In the page: the board's answer frames and overlays, for the probes.
  const probeBoard = page => page.evaluate(() => {
    window.probe = () => {
      const cell = id => document.querySelector(`.board .cell[data-tap="${id}"]`);
      const box = id => { const r = cell(id).querySelector('.frame').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      const pen = document.querySelector('.board svg.fx.pen')?.getBoundingClientRect();
      const ids = ['H', 'T', 'O'].filter(id => cell(id));
      return {
        frames: Object.fromEntries(ids.map(id => [id, box(id)])),
        pen: pen ? { left: pen.left, right: pen.right, top: pen.top, bottom: pen.bottom } : null,
        overlays: document.querySelectorAll('.fx').length,
        ok: ids.filter(id => cell(id).classList.contains('ok')),
        border: Object.fromEntries(ids.map(id => [id, getComputedStyle(cell(id).querySelector('.frame')).borderTopColor])),
        divider: getComputedStyle(cell('T').querySelector('.frame')).borderRightColor,
        digit: getComputedStyle(cell('T').querySelector('.v')).color,
        dpr: devicePixelRatio,
      };
    };
  });

  test('Level 6: the answer row is inked over as one frame, the lock is 320ms, the next problem fades in, nothing moves', async ({ page }) => {
    await open(page, 6);
    await setColumns(page, 47, 38, { cells: { O: '5', C: '1' }, done: [true, false], step: 1 });
    await probeBoard(page);
    await typeKeys(page, ['8']);
    const log = await watchRight(page, '.board', { trace: 70, divider: 120, inked: 225 });
    near(log.swap, 320, 'lock ');
    expect(log.opacityAtSwap).toBe('0');
    expect(log.transforms).toEqual(['none']);
    const mid = log.probes.trace;
    expect(mid.pen, 'the pen line is drawn mid-trace').not.toBeNull();
    // The written answer, 85: the tens and ones frames, as one.
    expectFramed({ ...mid, frame: { left: mid.frames.T.left, right: mid.frames.O.right, top: mid.frames.T.top, bottom: mid.frames.T.bottom } }, 'mid-trace');
    expect(mid.ok, 'the tens not green until the pen closes the frame').not.toContain('T');
    expect(mid.border.T).toBe(INK);
    expect(mid.divider, 'the divider still white before the digits turn').toBe(INK);
    // The divider between the tens and ones goes green with the digits
    // (100-150ms), not at the end; the tens' outer edges are the pen's.
    expect(log.probes.divider.divider, 'the divider going green at 120ms').not.toBe(INK);
    expect(log.probes.inked.divider).toBe(GOOD);
    expect(log.probes.divider.border.T).toBe(INK);
    const end = log.probes.inked;
    expect(end).toMatchObject({ overlays: 0, digit: GOOD });
    expect(end.ok).toEqual(expect.arrayContaining(['T', 'O']));
    expect(end.border.T).toBe(GOOD);
    await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
    await expect(page.locator('.board')).toHaveCSS('opacity', '1');
    await expect(page.locator('.board')).toHaveClass('board');
    await expect(page.locator('.fx')).toHaveCount(0);
  });

  test('Level 7: only the written answer is inked; an empty tens left for 0 is not framed', async ({ page }) => {
    await open(page, 7);
    await setColumns(page, 52, 47, { cells: { B: '4', O: '5' }, done: [true, false], step: 1 });
    await probeBoard(page);
    const log = await watchRight(page, '.board', { trace: 70 });
    const mid = log.probes.trace;
    expectFramed({ ...mid, frame: mid.frames.O }, 'mid-trace');
    near(log.swap, 320, 'lock ');
  });

  test('Level 6: a wrong digit is struck through, the carry left alone; a key clears it at once and is typed', async ({ page }) => {
    await open(page, 6);
    await setColumns(page, 47, 38);
    await typeKeys(page, ['4', '1']);
    const seen = await page.evaluate(PRESS => new Promise(resolve => {
      eval(PRESS);
      window.pressKey('Enter');
      const struck = [...document.querySelectorAll('.board svg.fx.redline')].map(s => s.dataset.cell);
      const ghost = document.querySelector('.board .cell[data-tap="O"] .ghost')?.textContent;
      // Its ends 4px or more inside the cell frame's inner edge, halo and all.
      const cellBox = document.querySelector('.board .cell[data-tap="O"]').getBoundingClientRect();
      const bw = parseFloat(getComputedStyle(document.querySelector('.board .cell[data-tap="O"] .frame')).borderLeftWidth);
      const line = document.querySelector('.board svg.fx.redline').getBoundingClientRect();
      const inset = Math.min(line.left - (cellBox.left + bw), cellBox.right - bw - line.right);
      const transforms = new Set();
      const t0 = performance.now();
      const frame = () => {
        transforms.add(getComputedStyle(document.querySelector('.board')).transform);
        for (const c of document.querySelectorAll('.board .cell')) transforms.add(getComputedStyle(c).translate);
        if (performance.now() - t0 < 200) return requestAnimationFrame(frame);
        window.pressKey('6');
        resolve({ struck, ghost, inset: inset >= 4 - 0.01, transforms: [...transforms], overlays: document.querySelectorAll('.fx').length, ghosts: document.querySelectorAll('.board .ghost').length });
      };
      requestAnimationFrame(frame);
    }), PRESS);
    expect(seen).toEqual({ struck: ['O'], ghost: '4', inset: true, transforms: ['none'], overlays: 0, ghosts: 0 });
    await expect(written(page, 'O')).toHaveText('6');
    await expect(written(page, 'C')).toHaveText('1');
    await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  });

  // In the page: Enter, then the red frame of the empty cell `id`, if any,
  // at `at` ms (its colour and style, and no dash), and when it is gone.
  const redFrameAfter = (page, id, at) => page.evaluate(([PRESS, id, at]) => new Promise(resolve => {
    eval(PRESS);
    const t0 = performance.now();
    window.pressKey('Enter');
    const log = { lines: document.querySelectorAll('.board svg.fx.redline').length };
    setTimeout(() => {
      const f = document.querySelector(`.board .cell[data-tap="${id}"] .redframe`);
      // Its weight is a solid big cell's (bw), however small the cell, and it
      // lies inside the cell, over its own frame.
      const bw = getComputedStyle(document.querySelector('.board .cell.big:not(.opt) .frame')).borderTopWidth;
      const c = f?.parentElement.getBoundingClientRect(), r = f?.getBoundingClientRect();
      log.frame = f && {
        cell: f.dataset.cell, colour: getComputedStyle(f).borderTopColor, style: getComputedStyle(f).borderTopStyle,
        opacity: getComputedStyle(f).opacity, moving: f.getAnimations().length,
        bw: getComputedStyle(f).borderTopWidth === bw, inside: r.left === c.left && r.right === c.right && r.top === c.top && r.bottom === c.bottom,
      };
    }, at);
    const frame = () => {
      if (performance.now() - t0 > at && !document.querySelector('.board .redframe')) { log.cleared = performance.now() - t0; resolve(log); } else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), [PRESS, id, at]);

  test('Level 6: a skipped carry\'s empty cell gets a solid warm-red frame, no dash, for 500ms', async ({ page }) => {
    await open(page, 6);
    await setColumns(page, 47, 38);
    await typeKeys(page, ['5']);
    const seen = await redFrameAfter(page, 'C', 250);
    expect(seen).toMatchObject({ lines: 0, frame: { cell: 'C', colour: RED, style: 'solid', opacity: '1', bw: true, inside: true } });
    near(seen.cleared, 500, 'red frame ');
    await expect(boardCell(page, 'C')).toHaveClass(/\bfocus\b/);
    await expect(boardCell(page, 'C').locator('.frame')).toHaveCSS('border-top-style', 'dashed');   // its own frame back
  });

  test('Level 7: a skipped borrow and an empty tens get the red frame; a key ends it at once', async ({ page }) => {
    await open(page, 7);
    await setColumns(page, 52, 27);
    await typeKeys(page, ['5']);
    expect(await redFrameAfter(page, 'B', 100)).toMatchObject({ lines: 0, frame: { cell: 'B', colour: RED, bw: true, inside: true } });
    await setColumns(page, 52, 27);
    await typeKeys(page, ['ArrowUp', '4', '5', 'Enter']);
    await expect(page.locator('#status')).toHaveText('Right. Tens column.');
    const after = await page.evaluate(PRESS => new Promise(resolve => {
      eval(PRESS);
      window.pressKey('Enter');
      const had = document.querySelector('.board .cell[data-tap="T"] .redframe')?.dataset.cell;
      setTimeout(() => {
        window.pressKey('2');
        resolve({ had, left: document.querySelectorAll('.board .redframe, .fx').length });
      }, 150);
    }), PRESS);
    expect(after).toEqual({ had: 'T', left: 0 });
    await expect(written(page, 'T')).toHaveText('2');
  });

  test.describe('under reduced motion', () => {
    test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

    test('Level 6: a right answer is inked at once, the lock is 320ms, nothing fades', async ({ page }) => {
      await open(page, 6);
      await setColumns(page, 47, 38, { cells: { O: '5', C: '1' }, done: [true, false], step: 1 });
      await probeBoard(page);
      await typeKeys(page, ['8']);
      const log = await watchRight(page, '.board', { at: 10 });
      expect(log.probes.at).toMatchObject({ overlays: 0, pen: null, digit: GOOD });
      expect(log.probes.at.border.T).toBe(GOOD);
      near(log.swap, 320, 'lock ');
      expect(log.opacityAtSwap).toBe('1');
      expect(log.transforms).toEqual(['none']);
      await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
    });

    test('Level 6: a wrong cell shows the strike still for 400ms', async ({ page }) => {
      await open(page, 6);
      await setColumns(page, 47, 38);
      await typeKeys(page, ['4', '1']);
      const log = await page.evaluate(PRESS => new Promise(resolve => {
        eval(PRESS);
        const t0 = performance.now();
        window.pressKey('Enter');
        const line = document.querySelector('.board svg.fx.redline');
        const log = { line: !!line, moving: line ? line.getAnimations().length : -1 };
        const frame = () => {
          if (!document.querySelector('.board svg.fx.redline')) { log.cleared = performance.now() - t0; resolve(log); } else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }), PRESS);
      expect(log).toMatchObject({ line: true, moving: 0 });
      near(log.cleared, 400, 'still strike ');
    });

    test('Level 6: a skipped carry\'s red frame shows still for 400ms', async ({ page }) => {
      await open(page, 6);
      await setColumns(page, 47, 38);
      await typeKeys(page, ['5']);
      const seen = await redFrameAfter(page, 'C', 20);
      expect(seen).toMatchObject({ frame: { colour: RED, opacity: '1', moving: 0 } });
      near(seen.cleared, 400, 'still red frame ');
    });
  });
});

// Out of lives: the game takes no key, so a key leaves the red-line alone.
test('a key during the out-of-lives red-line does not cut it short', async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
  for (let i = 0; i < 2; i++) await typeKeys(page, ['9', 'Enter']);
  await typeKeys(page, ['9']);
  const seen = await page.evaluate(PRESS => new Promise(resolve => {
    eval(PRESS);
    window.pressKey('Enter');
    setTimeout(() => {
      window.pressKey('5');
      resolve({ line: !!document.querySelector('svg.fx.redline'), ghost: document.querySelectorAll('.shown .ghost').length, eq: document.querySelector('#eq').className });
    }, 200);
  }), PRESS);
  expect(seen).toEqual({ line: true, ghost: 1, eq: 'eq struck' });
  await expect(page.locator('.select')).toBeVisible();
});

// Races: a new layout or leaving while an effect plays leaves nothing of it.
test.describe('races', () => {
  // In the page: `act` (a string run in the page) `when` after Enter (ms,
  // or 'in': the moment the screen's fade-in starts, as its class "in" is
  // added), then what is left once its layout has run. `before` is what was
  // playing just before the act: the pen, and the fade-in.
  const raceAfter = (page, when, act) => page.evaluate(([PRESS, when, act]) => new Promise(resolve => {
    eval(PRESS);
    const el = document.body.dataset.kind === 'column' ? document.querySelector('.board') : document.querySelector('#eq');
    const go = () => {
      const before = { pen: !!document.querySelector('svg.fx.pen'), fading: el.classList.contains('in') };
      eval(act);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const board = document.querySelector('.board');
        resolve({
          before,
          fx: document.querySelectorAll('.fx, .redframe, .ghost').length,
          eq: document.querySelector('#eq').className,
          board: board.className,
          inked: [...board.querySelectorAll('.cell')].filter(c => c.classList.contains('inked')).map(c => c.dataset.tap).sort(),
          ok: [...board.querySelectorAll('.cell')].filter(c => c.classList.contains('ok')).map(c => c.dataset.tap).sort(),
          opacity: getComputedStyle(document.body.dataset.kind === 'column' ? board : document.querySelector('#eq')).opacity,
          phase: window.mathtime.game.state.phase,
        });
      }));
    };
    if (when === 'in') {
      new MutationObserver((_, watch) => {
        if (!el.classList.contains('in')) return;
        watch.disconnect();
        go();
      }).observe(el, { attributes: true, attributeFilter: ['class'] });
    }
    window.pressKey('Enter');
    if (when !== 'in') setTimeout(go, when);
  }), [PRESS, when, act]);
  const RELAYOUT = 'window.mathtime.relayout()';
  const ESC = "dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))";
  const LEVELS = "document.querySelector('.crumbs .back').click()";

  test('a re-layout mid-trace ends it inked, no pen left', async ({ page }) => {
    await open(page);
    await setProblem(page, 3, 4);
    await typeKeys(page, ['7']);
    const left = await raceAfter(page, 70, RELAYOUT);
    expect(left.before.pen, 'the pen was tracing').toBe(true);
    expect(left).toMatchObject({ fx: 0, eq: 'eq correct inked', phase: 'correct' });
    await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
    await expect(page.locator('#eq')).toHaveClass('eq');
  });

  test('a re-layout mid-trace on the board ends it inked, the answer green, no pen left', async ({ page }) => {
    await open(page, 6);
    await setColumns(page, 47, 38, { cells: { O: '5', C: '1' }, done: [true, false], step: 1 });
    await typeKeys(page, ['8']);
    const left = await raceAfter(page, 70, RELAYOUT);
    expect(left.before.pen, 'the pen was tracing').toBe(true);
    expect(left).toMatchObject({ fx: 0, board: 'board', inked: ['T'], phase: 'correct' });
    expect(left.ok).toEqual(['C', 'H', 'O', 'T']);
    await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
  });

  test('a re-layout mid-red-line clears it', async ({ page }) => {
    await open(page);
    await setProblem(page, 3, 4);
    await typeKeys(page, ['9']);
    expect(await raceAfter(page, 200, RELAYOUT)).toMatchObject({ fx: 0, eq: 'eq' });
    await expect(page.locator('#shown')).toHaveText('');
  });

  test('a re-layout mid-red-line on the board clears it, and its red frame', async ({ page }) => {
    await open(page, 6);
    await setColumns(page, 47, 38);
    await typeKeys(page, ['5']);
    expect(await raceAfter(page, 200, RELAYOUT)).toMatchObject({ fx: 0, board: 'board' });
    await expect(boardCell(page, 'C')).not.toHaveClass(/\bstruck\b/);
  });

  test('a re-layout mid-fade-in ends it', async ({ page }) => {
    await open(page);
    await setProblem(page, 3, 4);
    await typeKeys(page, ['7']);
    expect(await raceAfter(page, 'in', RELAYOUT)).toMatchObject({ before: { fading: true }, fx: 0, eq: 'eq', opacity: '1', phase: 'playing' });
  });

  test('a re-layout mid-fade-in on the board ends it', async ({ page }) => {
    await open(page, 6);
    await setColumns(page, 47, 38, { cells: { O: '5', C: '1' }, done: [true, false], step: 1 });
    await typeKeys(page, ['8']);
    expect(await raceAfter(page, 'in', RELAYOUT)).toMatchObject({ before: { fading: true }, fx: 0, board: 'board', opacity: '1', phase: 'playing' });
  });

  test('Esc mid-red-line leaves nothing of it', async ({ page }) => {
    await open(page);
    await setProblem(page, 3, 4);
    await typeKeys(page, ['9']);
    expect(await raceAfter(page, 200, ESC)).toMatchObject({ fx: 0, eq: 'eq', phase: 'left' });
  });

  test('Esc mid-red-line on the board leaves nothing of it', async ({ page }) => {
    await open(page, 6);
    await setColumns(page, 47, 38);
    await typeKeys(page, ['4', '1']);
    expect(await raceAfter(page, 200, ESC)).toMatchObject({ fx: 0, board: 'board', phase: 'left' });
  });

  test('"Levels" mid-fade-in on the board leaves nothing of it', async ({ page }) => {
    await open(page, 6);
    await setColumns(page, 47, 38, { cells: { O: '5', C: '1' }, done: [true, false], step: 1 });
    await typeKeys(page, ['8']);
    expect(await raceAfter(page, 'in', LEVELS)).toMatchObject({ before: { fading: true }, fx: 0, board: 'board', opacity: '1', phase: 'left' });
  });
});
