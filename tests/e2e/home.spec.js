import { test, expect, withAccount } from './fixtures.js';
import { playTo, answer, settle, toLevels } from './helpers.js';
import { LEVELS, levelName } from '../../src/levels.js';

// The home screen (2026-11-17-home-screen-design.md, the home mockup):
// Home, the opening screen, and the pages behind it, Levels, the board,
// Progress and Settings; the breadcrumbs and Esc; the long board's pin.
// The day is fixed: 10:00 on Tue 17 Nov 2026, in UTC. The API is the fake
// in fixtures.js.

const DATE = '2026-11-17';
test.use({ timezoneId: 'UTC' });
const DAY_START = new Date('2026-11-17T10:00:00Z');
test.beforeEach(async ({ context, api }) => {
  api.now = () => DAY_START.getTime();
  await context.clock.install({ time: DAY_START });
  await context.clock.resume();
});

const loaded = page => page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
async function open(page) {
  await page.goto('/');
  await loaded(page);
  await page.evaluate(() => window.mathtime.account.settled());
  await settle(page);
}
const at = (page, cls) => expect(page.locator('body')).toHaveClass(new RegExp(`\\bat-${cls}\\b`));
const hero = page => page.locator('.home .hero');
const nextBtn = page => page.locator('.home .btn.next');
const levelsBtn = page => page.locator('.home .btn.levels');
const crumbs = page => page.locator('.crumbs').evaluate(c => [...c.children].filter(e => e.getClientRects().length).map(e => e.textContent.trim()).filter(Boolean).join(' › '));

// A run kept before the page loads, signed out, as the finish screen keeps it.
const run = (level, totalMs = 60_000 + level * 1_000) => ({
  id: `run-${level}`, level, finishedAt: '2026-11-16T09:30:00.000Z', totalMs, misses: 0, problems: [{ a: 1, b: 2, ms: totalMs, misses: 0 }],
});
const keepRuns = (page, levels) => page.addInitScript(r => localStorage.setItem('mathtime.runs', JSON.stringify(r)), levels.map(n => run(n)));
// The account's runs, stored by the API (its bests).
function storeRuns(api, levels, name = 'sam') {
  for (const n of levels) api.runs(name).set(`run-${n}`, run(n));
}
// Today's try, kept as ended in this browser: finished in `totalMs`.
const keepTry = (page, totalMs, name = 'sam') => page.addInitScript(([d, ms, who]) => localStorage.setItem('mathtime.daily', JSON.stringify({
  [d]: { id: 'try-1', started: true, ended: true, out: false, reached: 20, totalMs: ms, problems: [], current: null, name: who },
})), [DATE, totalMs, name]);

test.describe('Home', () => {
  test('is the opening screen: the title, the gear, the daily challenge, Next lesson, Levels and the links', async ({ page }) => {
    await open(page);
    await at(page, 'home');
    await expect(page.locator('.home .mark')).toHaveText('Math Time');
    await expect(page.locator('.home .gear')).toHaveAccessibleName('Settings');
    await expect(page.locator('.top')).toBeHidden();
    await expect(hero(page).locator('.h-title')).toHaveText('Daily challenge');
    await expect(hero(page).locator('.h-date')).toHaveText('Tue 17 Nov');
    await expect(hero(page).locator('.h-cta')).toHaveText('Start');
    await expect(hero(page)).toHaveAccessibleName('Daily challenge, Tue 17 Nov: 20 problems, one try. Start');
    await expect(nextBtn(page).locator('.b-title')).toHaveText('Addition 1');
    await expect(nextBtn(page).locator('.b-line')).toHaveText('Next lesson');
    await expect(levelsBtn(page).locator('.b-line')).toHaveText(`0 of ${LEVELS.length} finished`);
    await expect(page.locator('.home .links a')).toHaveText(['Leaderboard', 'Progress']);
  });

  test('before the try, Start plays it; once it has ended, Home shows "✓ Done", the time and the place', async ({ page }) => {
    await open(page);
    await hero(page).click();
    await page.waitForFunction(() => window.mathtime.game.level.daily && !document.body.classList.contains('at-home'));
    expect(await crumbs(page)).toBe('Home › Daily challenge');
    await playTo(page, 20);
    await answer(page);
    await at(page, 'daily');
    await page.keyboard.press('Escape');
    await at(page, 'home');
    await expect(hero(page).locator('.h-cta')).toHaveClass(/\bdone\b/);
    await expect(hero(page).locator('.ok')).toHaveText('Done');
    await expect(hero(page).locator('.res')).toHaveText(/^\d:\d\d\.\d · 1st of 1$/);
    await expect(hero(page)).toBeFocused();
    // The done line opens the board.
    await hero(page).click();
    await at(page, 'daily');
  });

  test('after the try: the time and the place, "1:12.6 · 3rd of 4"', async ({ page, api }) => {
    api.seedDaily(DATE, [{ name: 'alex', totalMs: 58_700 }, { name: 'bea', totalMs: 61_900 }, { name: 'kit', totalMs: 84_100 }]);
    api.daily.get(DATE).push({ name: 'sam', totalMs: 72_600, reached: 20, id: 'try-1' });
    await keepTry(page, 72_600);
    await open(page);
    await expect(hero(page).locator('.res')).toHaveText('1:12.6 · 3rd of 4');
    await expect(hero(page)).toHaveAccessibleName('Daily challenge, Tue 17 Nov: done, 1:12.6, 3rd of 4. Show the board');
  });

  test('offline after the try: the time alone', async ({ page, api }) => {
    api.down = true;
    await keepTry(page, 72_600);
    await open(page);
    await expect(hero(page).locator('.ok')).toHaveText('Done');
    await expect(hero(page).locator('.res')).toHaveText('1:12.6');
  });

  test('Next lesson is the first level not finished, in build order, and starts it', async ({ page }) => {
    await keepRuns(page, [1, 2]);
    await open(page);
    await expect(nextBtn(page).locator('.b-title')).toHaveText(levelName(LEVELS[2]));
    await expect(levelsBtn(page).locator('.b-line')).toHaveText(`2 of ${LEVELS.length} finished`);
    await nextBtn(page).click();
    await page.waitForFunction(n => !document.body.classList.contains('at-home') && window.mathtime.game.level.n === n, LEVELS[2].n);
    expect(await crumbs(page)).toBe(`Levels › ${levelName(LEVELS[2])}`);
    // Leaving the level goes to Levels.
    await page.keyboard.press('Escape');
    await at(page, 'select');
  });

  test('with every level finished, Next lesson is the level played last, "Last played"', async ({ page, api }) => {
    storeRuns(api, LEVELS.map(l => l.n));
    await page.addInitScript(() => localStorage.setItem('mathtime.lastPlayed', '3'));
    await open(page);
    await expect(nextBtn(page).locator('.b-line')).toHaveText('Last played');
    await expect(nextBtn(page).locator('.b-title')).toHaveText(levelName(LEVELS[2]));
    await expect(levelsBtn(page).locator('.b-line')).toHaveText(`${LEVELS.length} of ${LEVELS.length} finished`);
  });

  test('playing a level makes it the one "Last played"', async ({ page, api }) => {
    storeRuns(api, LEVELS.map(l => l.n));
    await open(page);
    await toLevels(page);
    await page.locator('.select .row[data-level="5"]').click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await at(page, 'home');
    await expect(nextBtn(page).locator('.b-title')).toHaveText(levelName(LEVELS[4]));
  });
});

test.describe('Home, signed out', () => {
  test.use({ account: null });

  test('a locked Next lesson shows the lock; a tap opens log in, and once in, the level starts', async ({ page }) => {
    await keepRuns(page, [1, 2, 3, 4]);
    await open(page);
    await expect(nextBtn(page).locator('.b-title')).toHaveText(levelName(LEVELS[4]));
    await expect(nextBtn(page).locator('.lock')).toBeVisible();
    await expect(nextBtn(page).locator('.chev')).toHaveCount(0);
    await expect(nextBtn(page)).toHaveAccessibleName(`Next lesson: ${levelName(LEVELS[4])}, locked: log in to play`);
    await nextBtn(page).click();
    await at(page, 'login');
    expect(await crumbs(page)).toBe('Home › Log in');
    // Esc goes back to Home, on Next lesson.
    await page.keyboard.press('Escape');
    await at(page, 'home');
    await expect(nextBtn(page)).toBeFocused();
    await nextBtn(page).click();
    await page.locator('#f-name').fill('sam');
    await page.locator('#f-pass').fill('password1');
    await page.keyboard.press('Enter');
    await page.waitForFunction(n => window.mathtime.game.level.n === n && !document.body.classList.contains('at-login'), LEVELS[4].n);
  });
});

test.describe('Progress', () => {
  test('a row per topic: its name, a segment per level, the finished green, and "1 of 2"', async ({ page, api }) => {
    storeRuns(api, [1, 2, 3, 4]);
    await open(page);
    await page.locator('.home .to-progress').click();
    await at(page, 'progress');
    expect(await crumbs(page)).toBe('Home › Progress');
    await expect(page.locator('.progress .s-title')).toHaveText('Progress');
    const topics = [...new Set(LEVELS.map(l => l.topic))];
    const expected = topics.map(t => {
      const of = LEVELS.filter(l => l.topic === t);
      return { topic: t, done: of.filter(l => l.n <= 4).length, of: of.length };
    });
    const rows = await page.locator('.progress .row').evaluateAll(rs => rs.map(r => ({
      topic: r.querySelector('.topic').textContent, of: r.querySelector('.of').textContent,
      segments: r.querySelectorAll('.bar span').length, green: r.querySelectorAll('.bar span.done').length,
    })));
    expect(rows).toEqual(expected.map(e => ({ topic: e.topic, of: `${e.done} of ${e.of}`, segments: e.of, green: e.done })));
    // A row opens Levels.
    await page.locator('.progress .row').first().click();
    await at(page, 'select');
  });
});

test.describe('Settings', () => {
  test('signed in: "Logged in as sam" and Log out, which signs out here', async ({ page, api }) => {
    await open(page);
    await page.locator('.home .gear').click();
    await at(page, 'settings');
    expect(await crumbs(page)).toBe('Home › Settings');
    await expect(page.locator('.settings .who')).toHaveText('Logged in as sam');
    await expect(page.locator('.settings .buttons button')).toHaveText(['Log out']);
    await page.locator('.settings .logout').click();
    await expect(page.locator('.settings .who')).toHaveText('Not logged in');
    await expect(page.locator('.settings .buttons button')).toHaveText(['Log in', 'Sign up']);
    await expect(page.locator('#status')).toHaveText('Logged out');
    expect(await page.evaluate(() => window.mathtime.account.name)).toBeNull();
    // It sticks: a reload is still signed out, and Settings says so.
    await expect.poll(() => api.requests.filter(r => r.path === '/api/logout' && r.method === 'POST').length).toBe(1);
    await page.reload();
    await open(page);
    expect(await page.evaluate(() => window.mathtime.account.name)).toBeNull();
    await page.locator('.home .gear').click();
    await expect(page.locator('.settings .who')).toHaveText('Not logged in');
  });

  test.describe('signed out', () => {
    test.use({ account: null });

    test('Log in opens the log-in screen, "Settings › Log in"; Esc comes back, and once in, Home', async ({ page }) => {
      await open(page);
      await page.locator('.home .gear').click();
      await page.locator('.settings .login').click();
      await at(page, 'login');
      expect(await crumbs(page)).toBe('Settings › Log in');
      await expect(page.locator('#f-name')).toBeFocused();
      await page.keyboard.press('Escape');
      await at(page, 'settings');
      await page.locator('.settings .login').click();
      await page.locator('#f-name').fill('sam');
      await page.locator('#f-pass').fill('password1');
      await page.keyboard.press('Enter');
      await at(page, 'home');
      await expect(page.locator('#status')).toHaveText('Signed in as sam');
      await page.locator('.home .gear').click();
      await expect(page.locator('.settings .who')).toHaveText('Logged in as sam');
    });

    test('Sign up opens the log-in screen in Sign up mode, "Settings › Sign up"', async ({ page }) => {
      await open(page);
      await page.locator('.home .gear').click();
      await page.locator('.settings .signup').click();
      await at(page, 'login');
      expect(await crumbs(page)).toBe('Settings › Sign up');
      await expect(page.locator('#f-invite')).toBeVisible();
      await expect(page.locator('#f-invite')).toBeFocused();
    });
  });
});

test.describe('breadcrumbs and Esc', () => {
  for (const [name, go, cls, crumb, back] of [
    ['Levels', p => levelsBtn(p).click(), 'select', 'Home › Levels', '.home .btn.levels'],
    ['the board', p => p.locator('.home .to-board').click(), 'daily', 'Home › Daily challenge', '.home .hero'],
    ['Progress', p => p.locator('.home .to-progress').click(), 'progress', 'Home › Progress', '.home .to-progress'],
    ['Settings', p => p.locator('.home .gear').click(), 'settings', 'Home › Settings', '.home .gear'],
  ]) {
    test(`${name}: "${crumb}"; Esc and the first link go up to Home`, async ({ page }) => {
      await open(page);
      await go(page);
      await at(page, cls);
      expect(await crumbs(page)).toBe(crumb);
      await page.keyboard.press('Escape');
      await at(page, 'home');
      await expect(page.locator(back)).toBeFocused();
      await go(page);
      await at(page, cls);
      await page.locator('.crumbs .back').click();
      await at(page, 'home');
    });
  }

  test('the sub-pages\' breadcrumb starts on the column\'s left edge', async ({ page }) => {
    await open(page);
    for (const [go, col] of [['.home .to-progress', '.progress .in'], ['.home .gear', '.settings .in'], ['.home .to-board', '.dboard .in']]) {
      await page.locator(go).click();
      await settle(page);
      const [word, edge] = await page.evaluate(c => [document.querySelector('.crumbs .back .word').getBoundingClientRect().left, document.querySelector(c).getBoundingClientRect().left], col);
      expect(Math.abs(word - edge)).toBeLessThanOrEqual(1);
      await page.keyboard.press('Escape');
    }
  });

  test('arriving at Levels from Home, the first row has the focus', async ({ page }) => {
    await open(page);
    await levelsBtn(page).click();
    await at(page, 'select');
    await expect(page.locator('.select .row[data-level="1"]')).toBeFocused();
    await expect(page.locator('.select .row.current')).toHaveCount(0);
  });

  test('Levels from Progress goes back to Progress, "Progress › Levels", the focus on the row you tapped', async ({ page }) => {
    await open(page);
    await page.locator('.home .to-progress').click();
    await page.locator('.progress .row[data-topic="Multiplication"]').click();
    await at(page, 'select');
    expect(await crumbs(page)).toBe('Progress › Levels');
    await page.keyboard.press('Escape');
    await at(page, 'progress');
    await expect(page.locator('.progress .row[data-topic="Multiplication"]')).toBeFocused();
  });

  test('Levels\' way back is where you came to it from this time, not before', async ({ page }) => {
    await open(page);
    // Board → Levels → back to the board → Home.
    await page.locator('.home .to-board').click();
    await page.locator('.dboard .levels').click();
    await page.keyboard.press('Escape');
    await at(page, 'daily');
    await page.keyboard.press('Escape');
    await at(page, 'home');
    // Next lesson, then out of it: Levels, under Home.
    await nextBtn(page).click();
    await page.keyboard.press('Escape');
    await at(page, 'select');
    expect(await crumbs(page)).toBe('Home › Levels');
    await page.keyboard.press('Escape');
    await at(page, 'home');
  });

  test('Levels from the board goes back to the board, "Daily challenge › Levels", the focus on its Levels', async ({ page }) => {
    await open(page);
    await page.locator('.home .to-board').click();
    await at(page, 'daily');
    await page.locator('.dboard .levels').click();
    await at(page, 'select');
    expect(await crumbs(page)).toBe('Daily challenge › Levels');
    await page.locator('.crumbs .back').click();
    await at(page, 'daily');
    await expect(page.locator('.dboard .levels')).toBeFocused();
  });

  test('Settings keeps the focus when the account is told again and nothing changed', async ({ page }) => {
    await open(page);
    await page.locator('.home .gear').click();
    await expect(page.locator('.settings .logout')).toBeFocused();
    await page.evaluate(() => window.mathtime.account.check());
    await page.evaluate(() => window.mathtime.account.settled());
    await expect(page.locator('.settings .logout')).toBeFocused();
  });

  test('Esc on Home does nothing', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Escape');
    await at(page, 'home');
  });

  test('a level\'s breadcrumb is "Levels › Addition 1": finishing it, its Levels goes to Levels', async ({ page }) => {
    await open(page);
    await toLevels(page);
    await page.locator('.select .row[data-level="1"]').click();
    expect(await crumbs(page)).toBe(`Levels › ${levelName(LEVELS[0])}`);
    await playTo(page, 20);
    await answer(page);
    await at(page, 'finish');
    await page.locator('.finish .levels').click();
    await at(page, 'select');
    expect(await crumbs(page)).toBe('Home › Levels');
  });

  test('the "Log in" link has left the header', async ({ page }) => {
    await open(page);
    await levelsBtn(page).click();
    await expect(page.locator('.top button')).toHaveCount(0);
  });
});

// ---------- The long board (spec §3b) ----------
// The board at a laptop's window: 7 rows show.
test.describe('the long board', () => {
  test.use({ viewport: { width: 1366, height: 657 } });
  const others = n => Array.from({ length: n }, (_, i) => ({ name: `p${String(i + 1).padStart(2, '0')}`, totalMs: 50_000 + i * 1_000 }));
  // `n` on the board, you `at` (1-based): your time puts you there.
  function seed(api, n, place) {
    api.seedDaily(DATE, others(n - 1));
    api.daily.get(DATE).push({ name: 'sam', totalMs: 50_000 + (place - 1) * 1_000 - 500, reached: 20, id: 'try-1' });
  }
  const board = async page => {
    await page.locator('.home .to-board').click();
    await at(page, 'daily');
    await settle(page);
    return page.evaluate(() => {
      const list = document.querySelector('.dboard .rows'), L = list.getBoundingClientRect();
      const lis = [...list.children];
      const shown = lis.filter(e => { const b = e.getBoundingClientRect(); return b.top >= L.top - 0.5 && b.bottom <= L.bottom + 0.5; }).length;
      const cut = lis.some(e => { const b = e.getBoundingClientRect(); return b.top < L.bottom - 1.5 && b.bottom > L.bottom + 0.5; });
      const pin = document.querySelector('.dboard .b-pin');
      return {
        scrolls: list.scrollHeight > list.clientHeight + 1, top: list.scrollTop, shown, cut,
        you: lis.findIndex(e => e.classList.contains('you')), pinned: !pin.hidden && pin.getClientRects().length > 0,
        pinText: pin.querySelector('.r').textContent, first: lis[0].textContent,
      };
    });
  };

  test('a long board scrolls alone, whole rows, from 1st place; your row pinned at its foot after "⋯"', async ({ page, api }) => {
    seed(api, 20, 17);
    await keepTry(page, 66_500);
    await open(page);
    const b = await board(page);
    expect(b.scrolls).toBe(true);
    expect(b.top).toBe(0);
    expect(b.first).toMatch(/^1p01/);
    expect(b.cut).toBe(false);
    expect(b.pinned).toBe(true);
    expect(b.pinText).toMatch(/^17sam/);
    expect(b.you).toBeGreaterThan(b.shown);
    await expect(page.locator('.dboard .b-gap')).toHaveText('⋯');
    // The page itself never scrolls, and the buttons stay in sight.
    await expect(page.locator('.dboard .b-btns')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.querySelector('.dboard').scrollHeight <= document.querySelector('.dboard').clientHeight + 1)).toBe(true);
    // Scrolled to your row, the pinned one hides, its room kept.
    await page.locator('.dboard .rows .you').scrollIntoViewIfNeeded();
    await expect(page.locator('.dboard .b-pin')).toHaveClass(/\baway\b/);
  });

  test('no false "⋯": the pin comes only when rows are really hidden between, and you are never hidden', async ({ page, api }) => {
    test.slow();
    for (const place of [6, 7, 8, 9, 10]) {
      api.daily.clear();
      seed(api, 12, place);
      await keepTry(page, 50_000 + (place - 1) * 1_000 - 500);
      await open(page);
      const b = await board(page);
      expect(b.scrolls, `you ${place}th`).toBe(true);
      expect(b.cut).toBe(false);
      if (b.pinned) expect(b.you, `you ${place}th, pinned`).toBeGreaterThan(b.shown);
      else expect(b.you, `you ${place}th, in the list`).toBeLessThan(b.shown);
    }
  });

  test('while the board loads, the date alone: no "0 played"', async ({ page, api }) => {
    // Nothing kept: the board is asked for only when it opens.
    seed(api, 7, 5);
    let release;
    const held = new Promise(r => { release = r; });
    await page.route(`**/api/daily/${DATE}`, async route => {
      await held;
      await route.fallback();
    });
    await open(page);
    await page.locator('.home .to-board').click();
    await at(page, 'daily');
    await expect(page.locator('.dboard .b-date')).toHaveText('Tue 17 Nov');
    await expect(page.locator('.dboard .note')).toHaveCount(0);
    release();
    await expect(page.locator('.dboard .b-date')).toHaveText('Tue 17 Nov · 7 played');
  });

  test('the board opened again opens at 1st place, wherever it was left', async ({ page, api }) => {
    seed(api, 20, 17);
    await keepTry(page, 65_500);
    await open(page);
    await page.locator('.home .to-board').click();
    await at(page, 'daily');
    await settle(page);
    await page.locator('.dboard .rows').evaluate(el => { el.scrollTop = 120; });
    await page.keyboard.press('Escape');
    await at(page, 'home');
    await page.locator('.home .to-board').click();
    await at(page, 'daily');
    await settle(page);
    expect(await page.locator('.dboard .rows').evaluate(el => el.scrollTop)).toBe(0);
  });

  test('a check of Home\'s still running shows on the board\'s Start too', async ({ page }) => {
    let release;
    const held = new Promise(r => { release = r; });
    await page.route(`**/api/daily/${DATE}`, async route => {
      await held;
      await route.fallback();
    });
    await open(page);
    await hero(page).click();
    await expect(hero(page)).toHaveAttribute('aria-busy', 'true');
    await page.locator('.home .to-board').click();
    await at(page, 'daily');
    await expect(page.locator('.dboard .practice')).toHaveText('Start');
    await expect(page.locator('.dboard .practice')).toHaveAttribute('aria-busy', 'true');
    release();
    await expect(page.locator('.dboard .practice')).not.toHaveAttribute('aria-busy', 'true', { timeout: 3_000 });
    await expect(page.locator('body')).toHaveClass(/\bat-daily\b/);
  });

  test('the same board again keeps its place; another tab\'s fetch updates an open board', async ({ page, context, api }) => {
    seed(api, 20, 17);
    await keepTry(page, 65_500);
    await open(page);
    await page.locator('.home .to-board').click();
    await at(page, 'daily');
    await settle(page);
    await page.locator('.dboard .rows').evaluate(el => { el.scrollTop = 120; });
    // Asked again (a relayout, the same board): it stays where it was.
    await page.evaluate(() => window.mathtime.relayout());
    await settle(page);
    expect(await page.locator('.dboard .rows').evaluate(el => el.scrollTop)).toBe(120);
    // Another tab fetches a board with one more on it: this board shows it.
    api.seedDaily(DATE, [{ name: 'zed', totalMs: 99_000 }]);
    const other = await context.newPage();
    await open(other);
    await expect(page.locator('.dboard .b-date')).toHaveText('Tue 17 Nov · 21 played');
  });

  test('a board that fits shows every row, and nothing scrolls or is pinned', async ({ page, api }) => {
    seed(api, 7, 5);
    await keepTry(page, 53_500);
    await open(page);
    const b = await board(page);
    expect(b.scrolls).toBe(false);
    expect(b.shown).toBe(7);
    expect(b.pinned).toBe(false);
  });
});

// ---------- Nothing scrolls (spec §3) ----------
// Home, Progress and Settings fit without scrolling at every checked
// window, signed in and out, each in a context of its own at its pixel
// ratio, with real scrollbars (the desktop project's browser: the phone
// project's hides them).
const SIZES = [[375, 812, 2], [320, 640, 2], [844, 390, 3], [1366, 657, 1], [1536, 730, 1.25], [1280, 610, 1.5], [1440, 900, 1], [1920, 1080, 1]];
test.describe('nothing scrolls on Home, Progress and Settings', () => {
  for (const [width, height, dpr] of SIZES) {
    test(`at ${width}×${height}@${dpr}`, async ({ browser, baseURL }) => {
      test.skip(test.info().project.name !== 'desktop', 'real scrollbars: the desktop project');
      for (const account of ['sam', null]) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, baseURL, timezoneId: 'UTC' });
        await context.clock.install({ time: DAY_START });
        await context.clock.resume();
        const api = await withAccount(context, account);
        api.now = () => DAY_START.getTime();
        const page = await context.newPage();
        await keepTry(page, 604_700, account);
        await open(page);
        for (const go of [null, '.home .to-progress', '.home .gear']) {
          if (go) await page.locator(go).click();
          await settle(page);
          const over = await page.evaluate(() => {
            const out = [];
            const de = document.documentElement;
            if (de.scrollWidth > innerWidth || de.scrollHeight > innerHeight) out.push(`page ${de.scrollWidth}×${de.scrollHeight}`);
            // The pages and anything that could scroll, either way; the
            // controls and lines across (their text boxes are trimmed to
            // the capitals, so a descender's ink is below them by design).
            for (const el of document.querySelectorAll('body, .top, div.home, div.progress, div.settings')) {
              if (!el.getClientRects().length) continue;
              if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) out.push(`${el.className || el.tagName} ${el.scrollWidth}×${el.scrollHeight} in ${el.clientWidth}×${el.clientHeight}`);
            }
            for (const el of document.querySelectorAll('.home .hero, .home .h-cta, .home .btn, .progress .row, .settings button, .settings .who')) {
              if (el.getClientRects().length && el.scrollWidth > el.clientWidth + 1) out.push(`${el.className} ${el.scrollWidth} across in ${el.clientWidth}`);
            }
            return out;
          });
          expect(over, `${go ?? 'Home'}, ${account ?? 'signed out'}`).toEqual([]);
          if (go) await page.keyboard.press('Escape');
        }
        await context.close();
      }
    });
  }
});
