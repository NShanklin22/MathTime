# Finished-Level Mark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the level selector, a finished level's row shows a green check and its best time in place of its sample problem.

**Architecture:** `selector.js` gives each row a hidden `.result` span (an SVG check and a `.best` time). A new `showBests(best)` method marks a row `finished` and fills its time and accessible name from `best(n)`. `main.js` calls it with `queue.best` on load and whenever the selector comes back. The CSS shows `.result` instead of `.sample` on a finished row, mirroring the title and name lines.

**Tech Stack:** Plain ES modules with no build step. Unit tests use node:test (`npm test`). Browser tests use Playwright 1.55.1 (`npx playwright test`): the phone project is 375×812 at 2×, desktop is 1440×900 at 1×. The dev server is `npm start` on port 5480.

**Spec:** `docs/superpowers/specs/2026-11-04-finished-mark-design.md`.

**Where:** `C:\code\MathTime`, on branch `no-road`, which already holds the roadmap strip's removal (dad5686). Files are CRLF in the working copy: change existing ones with the Edit tool.

**Not in this plan:** the selector's ink alignment (Level 2 plan, Task 5). It will move the sample and this mark onto their ink later. Here the mark is aligned by its boxes, as the title and name are now.

---

### Task 1: The mockup

**Files:**
- Create: `docs/superpowers/specs/2026-11-04-finished-mark-mockup.html`

- [ ] **Step 1: Write the mockup**

```html
<!doctype html>
<html lang="en" class="loading">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Finished-mark mockup</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- The finished-level mark (finished-mark spec §1) on the game's own
     styles and selector code (src/): the level selector, with
       ?done=1      Level 1 finished, Level 2 not (the default)
       ?done=1,2    both finished
       ?done=       neither
     and &long=1 for a long best on Level 1, 12:09.1. Served by the dev
     server. -->
<link rel="stylesheet" href="/src/styles.css">
<style>
  /* ---------- Finished-level mark (finished-mark spec §1) ---------- */
  /* A finished level's row: a green check on the title's line and the best
     time on the name's, right-aligned, in place of the sample. The column
     mirrors the title and name: boxes trimmed to the capitals and the
     baseline, 10px apart, so the lines pair up. The check is as tall as
     the title's capitals (1cap at the title's size; 0.7em, near it, where 1cap is unknown), its viewBox cropped
     to its ink, stroke included. */
  .select .row.finished .sample, .select .row:not(.finished) .result { display: none; }
  .select .result { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .select .result .tick { display: block; font-size: 17px; height: 0.7em; height: 1cap; width: auto; aspect-ratio: 20 / 14.5; overflow: visible; color: var(--good); }
  /* The keypad's check, at the title's weight. */
  .select .result .tick path { fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  /* Less the last letter's spacing: its box ends at its last digit. */
  .select .result .best { display: block; text-box: trim-both cap alphabetic; white-space: nowrap; font-size: 13px; letter-spacing: 0.02em; margin-right: -0.02em; color: var(--ink); }
</style>
</head>
<body class="at-select">
  <header class="top">
    <div class="where">
      <nav class="crumbs" aria-label="Breadcrumb">
        <span class="home" aria-current="page">Levels</span>
      </nav>
    </div>
  </header>
  <div class="select" role="region" aria-label="Levels"></div>
<script type="module">
  import { LEVELS } from '/src/levels.js';
  import { fontsReady } from '/src/fonts.js';
  import { createScanner } from '/src/scanner.js';
  import { fitHeader } from '/src/header.js';
  import { createSelector } from '/src/selector.js';
  import { formatTime } from '/src/finish.js';

  const params = new URLSearchParams(location.search);
  const done = new Set((params.get('done') ?? '1').split(',').filter(Boolean).map(Number));
  const BEST = { 1: params.get('long') ? 729_100 : 72_400, 2: 95_000 };
  // The keypad's check (index.html), its viewBox cropped to its ink.
  const CHECK = '<svg class="tick" viewBox="2 5 20 14.5"><path d="M3.5 12.5l5.5 5.5l11.5-11.5"/></svg>';

  const list = document.querySelector('.select');
  createSelector(list, LEVELS, () => {});
  for (const level of LEVELS) {
    const row = list.querySelector(`.row[data-level="${level.n}"]`);
    // Built here until selector.js builds it (plan Task 3), then reused.
    let result = row.querySelector('.result');
    if (!result) {
      result = document.createElement('span');
      result.className = 'result';
      result.setAttribute('aria-hidden', 'true');
      result.innerHTML = `${CHECK}<span class="best"></span>`;
      row.append(result);
    }
    if (!done.has(level.n)) continue;
    const time = formatTime(BEST[level.n]);
    row.classList.add('finished');
    result.querySelector('.best').textContent = time;
    row.setAttribute('aria-label', `Level ${level.n}: ${level.name}. Finished, best ${time}.`);
  }

  const scan = createScanner();
  fontsReady().then(() => {
    fitHeader(document.querySelector('.top'), scan);
    document.documentElement.classList.remove('loading');
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Look at it**

Run `npm start`, open `http://localhost:5480/docs/superpowers/specs/2026-11-04-finished-mark-mockup.html`, `?done=1,2`, `?done=` and `?done=1,2&long=1`. Check that the console has no errors and that a finished row shows the check and the time in place of its sample.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-11-04-finished-mark-mockup.html
git commit -m "docs: finished-level mark mockup"
```

- [ ] **Step 4: UI check, then the user (controller)**

A separate review agent renders the mockup and measures it, at 375×812 (2×), 1440×900 (1×), 844×390 (3×), 568×320 (2×) and 320×640 (2×), with `?done=1`, `?done=1,2`, `?done=` and `?done=1,2&long=1`. It checks that:
- the check's box is level with the title's and as tall as it;
- the time's box is level with the name's;
- both are right-aligned at the row's padding;
- the time clears the name by at least 8px at 320 wide, with the long time;
- an unfinished row is pixel-identical to the same row on the main page;
- the accessible names are right.

Only then are its screenshots shown to the user. Fix what it finds, then get the user's approval before Task 2.

---

### Task 2: The row's accessible name

**Files:**
- Modify: `src/selector.js`
- Create: `tests/unit/selector.test.js`

- [ ] **Step 1: Write the failing test**

`tests/unit/selector.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowLabel } from '../../src/selector.js';
import { LEVEL1 } from '../../src/level1.js';
import { LEVEL2 } from '../../src/level2.js';

// A level row's accessible name (finished-mark spec §4).

test('an unfinished level is named by its number and name alone', () => {
  assert.equal(rowLabel(LEVEL1, null), 'Level 1: Single-digit addition');
  assert.equal(rowLabel(LEVEL2, null), 'Level 2: Subtraction within 10');
});

test('a finished level\'s name adds its best time, written as the finish screen writes it', () => {
  assert.equal(rowLabel(LEVEL1, 72_400), 'Level 1: Single-digit addition. Finished, best 1:12.4.');
  assert.equal(rowLabel(LEVEL2, 729_100), 'Level 2: Subtraction within 10. Finished, best 12:09.1.');
});

test('a best of 0 ms is still a finished level', () => {
  assert.equal(rowLabel(LEVEL1, 0), 'Level 1: Single-digit addition. Finished, best 0:00.0.');
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm test`
Expected: FAIL. `rowLabel` is not exported by `src/selector.js` (a SyntaxError on the import).

- [ ] **Step 3: Write `rowLabel` and use it**

In `src/selector.js`, add the import under the existing one:

```js
import { reveal } from './reveal.js';
import { formatTime } from './finish.js';
```

Add this after the `DOUBLE_TAP_MS` constant:

```js
// A level row's accessible name: the level, and once it is finished, its
// best time `bestMs` (finished-mark spec §4). null is unfinished; 0 is a time.
export function rowLabel(level, bestMs) {
  const label = `Level ${level.n}: ${level.name}`;
  return bestMs == null ? label : `${label}. Finished, best ${formatTime(bestMs)}.`;
}
```

Replace the row's label line

```js
    row.setAttribute('aria-label', `Level ${level.n}: ${level.name}`);
```

with

```js
    row.setAttribute('aria-label', rowLabel(level, null));
```

- [ ] **Step 4: Run the tests**

Run: `npm test`. Expected: PASS, with 82 tests.
Run: `npx playwright test tests/e2e/selector.spec.js --reporter=line`. Expected: PASS, because the names are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/selector.js tests/unit/selector.test.js
git commit -m "feat: a level row's name can carry its best time"
```

---

### Task 3: The mark on the selector

**Files:**
- Modify: `src/selector.js`, `src/main.js`, `src/styles.css`
- Create: `tests/e2e/finished.spec.js`

- [ ] **Step 1: Write the failing tests**

`tests/e2e/finished.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { open, levelRow, finishRun, rect, resize, setProblem, typeKeys, GOOD } from './helpers.js';

// The finished-level mark (finished-mark spec): a finished level's row
// shows a green check and its best time in place of its sample.

// Runs kept before the page loads, as the finish screen keeps them.
const keptBefore = (page, records) => page.addInitScript(r => localStorage.setItem('mathtime.runs', JSON.stringify(r)), records);
const earlier = (level, totalMs) => ({
  id: `earlier-${level}-${totalMs}`, level, finishedAt: '2026-11-01T09:30:00.000Z', totalMs, misses: 0, problems: [],
});
async function home(page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
}
const result = (page, n) => levelRow(page, n).locator('.result');
const rgb = c => `rgb(${c.join(', ')})`;

test('with no run finished, every row keeps its sample and shows no mark', async ({ page }) => {
  await home(page);
  for (const n of [1, 2]) {
    await expect(levelRow(page, n)).not.toHaveClass(/\bfinished\b/);
    await expect(levelRow(page, n).locator('.sample')).toBeVisible();
    await expect(result(page, n)).toBeHidden();
  }
  await expect(levelRow(page, 1)).toHaveAttribute('aria-label', 'Level 1: Single-digit addition');
});

test('a finished level shows a green check and its best time in place of its sample; the others don\'t', async ({ page }) => {
  await keptBefore(page, [earlier(1, 80_000), earlier(1, 72_400)]);
  await home(page);
  const row = levelRow(page, 1);
  await expect(row).toHaveClass(/\bfinished\b/);
  await expect(row.locator('.sample')).toBeHidden();
  await expect(result(page, 1)).toBeVisible();
  await expect(result(page, 1)).toHaveAttribute('aria-hidden', 'true');
  await expect(result(page, 1).locator('.best')).toHaveText('1:12.4');
  await expect(result(page, 1).locator('.tick')).toHaveCSS('color', rgb(GOOD));
  await expect(result(page, 1).locator('.best')).toHaveCSS('font-size', '13px');
  await expect(result(page, 1).locator('.best')).toHaveCSS('color', 'rgb(238, 245, 255)');
  await expect(row).toHaveAttribute('aria-label', 'Level 1: Single-digit addition. Finished, best 1:12.4.');
  await expect(page.getByRole('button', { name: 'Level 1: Single-digit addition. Finished, best 1:12.4.' })).toBeVisible();
  await expect(levelRow(page, 2)).not.toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 2).locator('.sample')).toBeVisible();
  await expect(result(page, 2)).toBeHidden();
});

test('a run just finished shows on its row when you come back by "Levels"', async ({ page }) => {
  await open(page, 2);
  await finishRun(page);
  const time = await page.locator('.finish .done-time').textContent();
  await page.locator('.finish .levels').click();
  await expect(page.locator('.select')).toBeVisible();
  await expect(result(page, 2).locator('.best')).toHaveText(time);
  await expect(levelRow(page, 2)).toHaveAttribute('aria-label', `Level 2: Subtraction within 10. Finished, best ${time}.`);
  await expect(levelRow(page, 1)).not.toHaveClass(/\bfinished\b/);
});

test('a run that runs out of lives leaves no mark', async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 1)).not.toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 1).locator('.sample')).toBeVisible();
});

test('with storage blocked, no row is marked and a level still starts', async ({ page }) => {
  await page.addInitScript(() => {
    const refuse = () => { throw new DOMException('Storage is blocked (test)', 'SecurityError'); };
    Storage.prototype.getItem = refuse;
    Storage.prototype.setItem = refuse;
  });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await home(page);
  await expect(page.locator('.select .row.finished')).toHaveCount(0);
  await levelRow(page, 1).click();
  await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
  expect(errors).toEqual([]);
});

// The mark mirrors the title and name: the check level with the title's
// capitals and as tall, the time level with the name's, both right-aligned
// at the row's 24px padding, and clear of the name, a long time too.
for (const [width, height] of [[375, 812], [320, 640], [1440, 900]]) test(`at ${width}×${height} the check is on the title's line, the time on the name's, right-aligned`, async ({ page }) => {
  await keptBefore(page, [earlier(1, 729_100), earlier(2, 95_000)]);
  await home(page);
  await resize(page, width, height);
  for (const n of [1, 2]) {
    const row = `.select .row[data-level="${n}"]`;
    const [r, title, name, tick, best] = await Promise.all(['', ' .title', ' .name', ' .tick', ' .best'].map(s => rect(page, row + s)));
    expect(Math.abs(tick.top - title.top), `Level ${n}: check on the title's line`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(tick.height - title.height), `Level ${n}: check as tall as the capitals`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(best.top - name.top), `Level ${n}: time on the name's line`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(best.height - name.height), `Level ${n}: time as tall as the name`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(r.right - 24 - tick.right), `Level ${n}: check at the padding`).toBeLessThanOrEqual(0.05);
    expect(Math.abs(r.right - 24 - best.right), `Level ${n}: time at the padding`).toBeLessThanOrEqual(0.05);
    expect(best.left - name.right, `Level ${n}: time clear of the name`).toBeGreaterThanOrEqual(8);
  }
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx playwright test tests/e2e/finished.spec.js --reporter=line`
Expected: the first test passes. It holds once the mark exists too: a hidden `.result` counts as hidden even before one exists. Every other test fails, on `toHaveClass(/finished/)`, `.result` not found, or a rect of a missing `.tick`.

- [ ] **Step 3: Build the mark in `src/selector.js`**

Add this after `rowLabel`:

```js
// The keypad's check (index.html), its viewBox cropped to its ink.
const CHECK = '<svg class="tick" viewBox="2 5 20 14.5"><path d="M3.5 12.5l5.5 5.5l11.5-11.5"/></svg>';
```

In the row loop, replace

```js
    row.append(txt, sample);
```

with

```js
    // Its result, once it is finished (finished-mark spec §1): a check on
    // the title's line and the best time on the name's, shown in place of
    // the sample by showBests().
    const result = el('span', 'result');
    result.setAttribute('aria-hidden', 'true');
    result.innerHTML = CHECK;
    result.append(el('span', 'best'));
    row.append(txt, sample, result);
```

Add this method before `focus()`:

```js
  // Show each level's result: a level with a best time, `best(n)` in ms
  // (null if none), is finished. Its row shows the check and that time,
  // and its name says so (finished-mark spec).
  function showBests(best) {
    for (const [level, row] of rows) {
      const ms = best(level.n);
      row.classList.toggle('finished', ms != null);
      row.querySelector('.best').textContent = ms == null ? '' : formatTime(ms);
      row.setAttribute('aria-label', rowLabel(level, ms));
    }
  }
```

Change the return line to:

```js
  return { mark, cameFrom, showBests, focus };
```

- [ ] **Step 4: Style it in `src/styles.css`**

Add this after the `.select .sample .op` rule:

```css
/* A finished level (finished-mark spec §1): a green check on the title's
   line and the best time on the name's, right-aligned, in place of the
   sample. The column mirrors the title and name: boxes trimmed to the
   capitals and the baseline, 10px apart, so the lines pair up. The check
   is as tall as the title's capitals (1cap at the title's size; 0.7em, near it, where 1cap is unknown), its
   viewBox cropped to its ink, stroke included. */
.select .row.finished .sample, .select .row:not(.finished) .result { display: none; }
.select .result { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.select .result .tick { display: block; font-size: 17px; height: 0.7em; height: 1cap; width: auto; aspect-ratio: 20 / 14.5; overflow: visible; color: var(--good); }
/* The keypad's check, at the title's weight. */
.select .result .tick path { fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
/* Less the last letter's spacing: its box ends at its last digit. */
.select .result .best { display: block; text-box: trim-both cap alphabetic; white-space: nowrap; font-size: 13px; letter-spacing: 0.02em; margin-right: -0.02em; color: var(--ink); }
```

- [ ] **Step 5: Fill it from the queue in `src/main.js`**

After `const queue = createQueue();` add:

```js
// Each finished level's best, from the runs kept (finished-mark spec §2).
selector.showBests(queue.best);
```

In `toSelector`, after `selector.mark(game.level);`, add:

```js
  selector.showBests(queue.best);    // with the run just finished, if any
```

- [ ] **Step 6: Run the tests**

Run: `npx playwright test tests/e2e/finished.spec.js --reporter=line`. Expected: all pass, on both projects.
Then run the whole suite: `npm test` (82 pass) and `npx playwright test --reporter=line`. Expected: all pass. The old selector tests still hold, because an unfinished row is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/selector.js src/main.js src/styles.css tests/e2e/finished.spec.js
git commit -m "feat: a finished level's row shows a check and its best time"
```

---

### Task 4: UI gate, and finishing the branch

- [ ] **Step 1: UI gate (controller)**

A separate review agent renders the real game and the approved mockup at the five sizes in Task 1 Step 4, with runs kept to match each mockup view, and compares them pixel by pixel. It also plays a run to the end, presses "Levels", and checks the new row. Any difference from the mockup is a defect unless the mockup was wrong. Its screenshots then go to the user.

- [ ] **Step 2: Finish the branch**

With the user's approval, merge `no-road` into `main` locally, run `npm test` and `npx playwright test` on `main`, then delete the branch. Push only when the user says to.
