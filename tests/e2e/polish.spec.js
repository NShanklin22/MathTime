import { test, expect } from '@playwright/test';
import {
  open, freeze, showOutline, settle, setProblem, rect, capture, ink, digitInk, digitBand, boxEdges, outlineEdges,
  typeKeys, TOL, MUTED, LOST,
} from './helpers.js';

// The spacing, centring, header and short-screen targets of spec §3.1, §3.2
// and §6, measured in real screenshot pixels.

// A new problem, laid out in full as the first one is at startup.
const layOut = (page, a, b) => page.evaluate(([a, b]) => {
  const { game, layout } = window.mathtime;
  game.state.problem = { a, b, answer: a + b };
  layout.layout();
}, [a, b]);

// How far the centre of what you see of the equation, from the first digit's
// ink to the box's dashed outline, is right of the problem area's centre.
// Needs showOutline().
async function groupOffset(page) {
  const shot = await capture(page);
  const first = await digitInk(page, shot, '#a');
  const outline = await outlineEdges(page, shot);
  const s = await rect(page, '.stage');
  return (first.left + outline.right) / 2 - (s.left + s.right) / 2;
}

// Records a measurement in the report, so drift shows.
const note = (type, px) => test.info().annotations.push({ type, description: `${px.toFixed(3)}px` });

test.beforeEach(async ({ page }) => {
  await open(page);
  await freeze(page);
});

test('the ink gap from "=" to the box matches the mean ink gap around the second number', async ({ page }) => {
  // The mean over every digit of the gaps "+" → digit and digit → "=".
  let sum = 0;
  for (let b = 0; b <= 9; b++) {
    await setProblem(page, 5, b);
    const shot = await capture(page);
    const plus = ink(shot, await rect(page, '.op', 0), MUTED);
    const digit = await digitInk(page, shot, '#b');
    const equals = ink(shot, await rect(page, '.op', 1), MUTED);
    sum += (digit.left - plus.right) + (equals.left - digit.right);
  }
  const mean = sum / 20;
  const shot = await capture(page);
  const equals = ink(shot, await rect(page, '.op', 1), MUTED);
  const gap = (await boxEdges(page, shot)).left - equals.right;
  note('mean digit gap', mean);
  note('"=" → box gap', gap);
  expect(Math.abs(gap - mean)).toBeLessThanOrEqual(TOL);
});

test('what you see of the equation is centred, for every first digit', async ({ page }) => {
  await showOutline(page);
  let worst = 0;
  for (let a = 0; a <= 9; a++) {
    await layOut(page, a, 5);
    const off = await groupOffset(page);
    worst = Math.max(worst, Math.abs(off));
    expect(Math.abs(off), `a = ${a}: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
  }
  note('worst centring', worst);
});

// "4" and "7" have the least and the most space before their ink in Plex
// Mono, so a placement made for one is visibly off-centre for the other.

test('a new problem after a correct answer is centred before it slides in', async ({ page }) => {
  await showOutline(page);
  await layOut(page, 4, 3);
  await page.evaluate(() => {
    const { game } = window.mathtime;
    const next = game.next;
    game.next = () => {
      next();
      game.state.problem = { a: 7, b: 1, answer: 8 };
    };
    // Where the equation is when the slide-in starts.
    const eq = document.querySelector('#eq');
    const watch = new MutationObserver(() => {
      if (!eq.classList.contains('in')) return;
      watch.disconnect();
      window.leftAtSlideIn = eq.style.left;
    });
    watch.observe(eq, { attributes: true, attributeFilter: ['class'] });
  });
  await typeKeys(page, ['7', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  await expect(page.locator('#eq')).not.toHaveClass(/\bin\b/);   // it has slid in
  expect(await page.evaluate(() => document.querySelector('#eq').style.left)).toBe(await page.evaluate(() => window.leftAtSlideIn));
  const off = await groupOffset(page);
  note('centring after a correct answer', off);
  expect(Math.abs(off)).toBeLessThanOrEqual(TOL);
});

test('the first problem of a restarted game is centred from its first frame', async ({ page }) => {
  await showOutline(page);
  await layOut(page, 4, 3);
  await page.evaluate(() => {
    const { game } = window.mathtime;
    const restart = game.restart;
    game.restart = () => {
      restart();
      game.state.problem = { a: 7, b: 1, answer: 8 };
    };
    // Where the equation is once the click is handled (this listener runs
    // after the game's own). A later layout, when the problem area reappears,
    // must not be what puts it right.
    document.querySelector('#level1').addEventListener('click', () => {
      window.leftAtRestart = document.querySelector('#eq').style.left;
    });
  });
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await page.locator('#level1').click();
  await expect(page.locator('#a')).toHaveText('7');
  await settle(page);                                     // any later layout has run
  expect(await page.evaluate(() => document.querySelector('#eq').style.left)).toBe(await page.evaluate(() => window.leftAtRestart));
  const off = await groupOffset(page);
  note('centring after a restart', off);
  expect(Math.abs(off)).toBeLessThanOrEqual(TOL);
});

// The header, with `lives` hearts still full (the rest drawn as lost).
async function header(page, lives) {
  await page.evaluate(n => {
    const { game, view } = window.mathtime;
    game.state.lives = n;
    view.render(game.state);
  }, lives);
  const shot = await capture(page);
  // All the crumbs and separators. The current crumb is brighter than the
  // muted colour, which still counts it as fully inked.
  const crumbs = ink(shot, await rect(page, '.crumbs'), MUTED);
  const hearts = [];
  for (let i = 0; i < 3; i++) {
    const r = await rect(page, '.lives svg', i);
    const area = { left: r.left - 2, right: r.right + 2, top: r.top - 2, bottom: r.bottom + 2 };
    hearts.push(ink(shot, area, i < lives ? undefined : LOST));
  }
  return { crumbs, hearts, width: await page.evaluate(() => innerWidth) };
}

test('the hearts are centred on the breadcrumb text, full or lost', async ({ page }) => {
  for (const lives of [3, 2, 0]) {
    const { crumbs, hearts } = await header(page, lives);
    hearts.forEach((heart, i) => {
      const off = heart.midY - crumbs.midY;
      if (lives === 3 && i === 0) note('hearts below the crumbs', off);
      expect(Math.abs(off), `${lives} lives, heart ${i + 1}: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
    });
  }
});

test('the header\'s ink margins match left and right, full or lost', async ({ page }) => {
  for (const lives of [3, 2, 0]) {
    const { crumbs, hearts, width } = await header(page, lives);
    const left = crumbs.left;
    const right = width - hearts[2].right;
    if (lives === 3) {
      note('left ink margin', left);
      note('right ink margin', right);
    }
    expect(Math.abs(right - left), `${lives} lives: left ${left.toFixed(3)}px, right ${right.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
  }
});

// Landscape phones leave a short problem area; the tall, narrow one is a
// sanity check that needs no shrinking for height.
for (const [width, height] of [[667, 375], [844, 390], [568, 320], [320, 740]]) {
  test(`at ${width}×${height}, "Question N" and the box clear the problem area by 8px`, async ({ page }) => {
    // Keep the project's own pixel ratio. setViewportSize would drop the
    // phone project's real 2x to 1x, so the phone's size is emulated. The
    // desktop project's viewport belongs to Playwright, which puts it back
    // for screenshots, so that one is resized through Playwright (still 1x).
    if (test.info().project.name === 'phone') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
    } else {
      await page.setViewportSize({ width, height });
    }
    await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
    await settle(page);
    const stage = await rect(page, '.stage');
    // The digit ink stays centred in the problem area.
    const digits = await digitBand(page);
    note('digit ink below centre', digits.mid - (stage.top + stage.bottom) / 2);
    expect(Math.abs(digits.mid - (stage.top + stage.bottom) / 2), 'digit ink centre').toBeLessThanOrEqual(TOL);
    await showOutline(page);
    const shot = await capture(page);
    const q = await rect(page, '#qnum');
    // Only what the problem area shows: it clips anything outside it. The
    // layout boxes are recorded too, since clipped ink can't say how far out
    // it would reach.
    note('"Question N" box below the top', q.top - stage.top);
    note('box outline below the bottom', await page.evaluate(() => {
      const after = getComputedStyle(document.querySelector('#slot'), '::after');
      const bottom = document.querySelector('#slot').getBoundingClientRect().top + parseFloat(after.top) + parseFloat(after.height);
      return document.querySelector('.stage').getBoundingClientRect().bottom - bottom - parseFloat(after.outlineOffset) - parseFloat(after.outlineWidth);
    }));
    const label = ink(shot, { left: q.left - 4, right: q.right + 4, top: stage.top, bottom: Math.min(q.bottom + 4, stage.bottom) }, MUTED);
    const box = await outlineEdges(page, shot);
    expect(label, '"Question N" shows').not.toBeNull();
    note('"Question N" ink below the top', label.top - stage.top);
    note('outline ink above the bottom', stage.bottom - box.bottom);
    expect(label.top - stage.top, '"Question N" clear above').toBeGreaterThanOrEqual(8);
    expect(stage.bottom - box.bottom, 'box clear below').toBeGreaterThanOrEqual(8);
    if (height > width) {
      // Tall enough: nothing shrinks for height, so the label keeps its size.
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('#qnum')).fontSize)).toBe('15px');
    }
  });
}
