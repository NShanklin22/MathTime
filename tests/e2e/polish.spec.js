import { test, expect } from '@playwright/test';
import {
  open, freeze, showOutline, settle, resize, setProblem, layOut, rect, capture, ink, digitBand, groupOffset,
  equalsGap, labelInk, clearances, note, fontSize, typeKeys, TOL, MUTED, LOST,
} from './helpers.js';

// The spacing, centring, header and short-screen targets of spec §3.1, §3.2
// and §6, measured in real screenshot pixels.

test.beforeEach(async ({ page }) => {
  await open(page);
  await freeze(page);
});

test('the ink gap from "=" to the box matches the mean ink gap around the second number', async ({ page }) => {
  const { mean, gap } = await equalsGap(page);
  note('mean digit gap', mean);
  note('"=" → box gap', gap);
  expect(Math.abs(gap - mean)).toBeLessThanOrEqual(TOL);
});

test('what you see of the equation is centred, for every first digit', async ({ page }) => {
  await showOutline(page);
  let worst = 0;
  for (let a = 0; a <= 9; a++) {
    await layOut(page, a, 5);
    const off = (await groupOffset(page)).offset;
    worst = Math.max(worst, Math.abs(off));
    expect(Math.abs(off), `a = ${a}: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
  }
  note('worst centring', worst);
});

test('"Question N" has its ink centred over what you see', async ({ page }) => {
  await showOutline(page);
  let worst = 0;
  for (const [question, a] of [[1, 5], [7, 4], [10, 7], [18, 1]]) {
    await page.evaluate(n => { window.mathtime.game.state.question = n; }, question);
    await setProblem(page, a, 3);
    const { first, outline, shot } = await groupOffset(page);
    const off = (await labelInk(page, shot)).midX - (first.left + outline.right) / 2;
    worst = Math.max(worst, Math.abs(off));
    expect(Math.abs(off), `Question ${question}, a = ${a}: ${off.toFixed(3)}px`).toBeLessThanOrEqual(TOL);
  }
  note('worst label centring', worst);
});

test('a new problem after a correct answer is centred before it slides in', async ({ page }) => {
  // "4" and "7" have the least and the most space before their ink in Plex
  // Mono, so a placement made for one is visibly off-centre for the other.
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
  const off = (await groupOffset(page)).offset;
  note('centring after a correct answer', off);
  expect(Math.abs(off)).toBeLessThanOrEqual(TOL);
});

test('the first problem of a restarted game is centred from its first frame', async ({ page }) => {
  // From "4" to "7", as after a correct answer.
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
  const off = (await groupOffset(page)).offset;
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

// Short portrait screens leave a short problem area (landscape ones get the
// keypad beside it: landscape.spec.js); the tall, narrow one is a sanity
// check that needs no shrinking for height.
for (const [width, height] of [[360, 400], [400, 430], [320, 740]]) {
  test(`at ${width}×${height}, "Question N" and the box clear the problem area by 8px`, async ({ page }) => {
    await resize(page, width, height);
    const stage = await rect(page, '.stage');
    // The digit ink stays centred in the problem area.
    const digits = await digitBand(page);
    note('digit ink below centre', digits.mid - (stage.top + stage.bottom) / 2);
    expect(Math.abs(digits.mid - (stage.top + stage.bottom) / 2), 'digit ink centre').toBeLessThanOrEqual(TOL);
    await showOutline(page);
    const { above, below } = await clearances(page);
    expect(above, '"Question N" shows').not.toBeNull();
    note('font size', await fontSize(page));
    note('"Question N" ink below the top', above);
    note('outline ink above the bottom', below);
    expect(above, '"Question N" clear above').toBeGreaterThanOrEqual(8);
    expect(below, 'box clear below').toBeGreaterThanOrEqual(8);
    if (height > 600) {
      // Tall enough: nothing shrinks for height, so the label keeps its size.
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('#qnum')).fontSize)).toBe('15px');
    }
  });
}

// Where the digits' ink band sits against the problem area, from the layout
// (pixels can't show what the problem area clips), and how far inside it the
// drawn digit ink stays.
async function digitsInside(page) {
  const stage = await rect(page, '.stage');
  const band = await page.evaluate(() => {
    const eq = document.querySelector('#eq');
    const cs = getComputedStyle(eq);
    const fs = parseFloat(cs.fontSize);
    const top = eq.getBoundingClientRect().top + parseFloat(cs.getPropertyValue('--ink-top')) * fs;
    return { top, bottom: top + parseFloat(cs.getPropertyValue('--ink-h')) * fs };
  });
  const shot = await capture(page);
  let drawn = Infinity;
  for (const sel of ['#a', '#b']) {
    const r = await rect(page, sel);
    const d = ink(shot, { ...r, top: Math.max(r.top - 4, stage.top), bottom: Math.min(r.bottom + 4, stage.bottom) });
    drawn = Math.min(drawn, d.top - stage.top, stage.bottom - d.bottom);
  }
  return { above: band.top - stage.top, below: stage.bottom - band.bottom, drawn };
}

test('a problem area too short for 8px clear still fits the whole group', async ({ page }) => {
  // About 30px tall: no font size keeps 8px clear, because the box border
  // and outline keep their px sizes.
  await resize(page, 300, 310);
  await showOutline(page);
  const { above, below } = await clearances(page);
  note('font size', await fontSize(page));
  expect(above, '"Question N" shows').not.toBeNull();
  note('"Question N" ink below the top', above);
  note('outline ink above the bottom', below);
  expect(Math.min(above, below), 'less than 8px clear: the rule cannot be met').toBeLessThan(8);
  expect(above, '"Question N" inside').toBeGreaterThanOrEqual(0);
  expect(below, 'outline inside').toBeGreaterThanOrEqual(0);
  const digits = await digitsInside(page);
  expect(Math.min(digits.above, digits.below), 'digit ink band inside').toBeGreaterThanOrEqual(0);
});

test('a problem area too short even for the box still shows the digits whole', async ({ page }) => {
  await page.addStyleTag({ content: '.stage{max-height:14px!important}' });
  await settle(page);
  expect((await rect(page, '.stage')).height).toBe(14);
  const digits = await digitsInside(page);
  note('font size', await fontSize(page));
  note('digit ink band inside, worst side', Math.min(digits.above, digits.below));
  expect(Math.min(digits.above, digits.below), 'digit ink band inside').toBeGreaterThanOrEqual(0);
  expect(digits.drawn, 'drawn digits not cut by the edge').toBeGreaterThan(0.25);
});
