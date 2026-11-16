import { test, expect, withAccount } from './fixtures.js';
import { playTo, answer, typeKeys, settle, levelRow } from './helpers.js';
import { dailyProblems } from '../../src/daily.js';
import { LEVELS } from '../../src/levels.js';

// The daily challenge (2026-11-14-daily-challenge-design.md, the daily
// mockup): the tile, the one scored try, Practice, the board and the
// upload. The day is fixed: 10:00 on Sat 14 Nov 2026, in UTC. The API is
// the fake in fixtures.js.

const DATE = '2026-11-14';
test.use({ timezoneId: 'UTC' });
// The clock starts there and runs: the game times the problems by it.
const DAY_START = new Date('2026-11-14T10:00:00Z');
async function onTheDay(context, at = DAY_START) {
  await context.clock.install({ time: at });
  await context.clock.resume();
}
// The fake API's clock is on the day too: it takes a date a day either
// side of its own.
test.beforeEach(async ({ context, api }) => {
  api.now = () => DAY_START.getTime();
  await onTheDay(context);
});

const loaded = page => page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
async function home(page) {
  await page.goto('/');
  await loaded(page);
  await page.evaluate(() => window.mathtime.account.settled());
}
const tile = page => page.locator('.select .daily');
const atBoard = page => expect(page.locator('body')).toHaveClass(/\bat-daily\b/);
const atSelect = page => expect(page.locator('body')).toHaveClass(/\bat-select\b/);
const posts = api => api.requests.filter(r => r.path === '/api/daily' && r.method === 'POST');
const outbox = page => page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.outbox')) ?? []);
const kept = page => page.evaluate(d => JSON.parse(localStorage.getItem('mathtime.daily'))?.[d] ?? null, DATE);
const rowsText = page => page.locator('.dboard .rows > li').evaluateAll(lis => lis.map(li => [...li.children].map(c => c.textContent).join(' ')));

// The challenge from the tile, its first problem on screen.
async function start(page) {
  await tile(page).click();
  await page.waitForFunction(() => !document.body.classList.contains('at-select') && window.mathtime.game.level.daily);
}
// Finish the scored try: answered at once to question 20, the last typed.
async function finish(page) {
  await playTo(page, 20);
  await answer(page);
  await atBoard(page);
}
// Three misses on the problem on screen: out.
async function goOut(page) {
  for (let i = 0; i < 3; i++) {
    const wrong = await page.evaluate(() => (window.mathtime.game.state.problem.answer + 1) % 10);
    await typeKeys(page, [String(wrong), 'Enter']);
    await page.waitForFunction(i => window.mathtime.game.state.lives === 2 - i, i);
  }
}
// Answer the problem on screen as the player does, and wait for the next.
async function answerOne(page) {
  const q = await page.evaluate(() => window.mathtime.game.state.question);
  await answer(page);
  await page.waitForFunction(q => window.mathtime.game.state.question === q + 1 && window.mathtime.game.state.phase === 'playing', q);
}
// Leave a scored try partway: the question first, then Leave.
async function leave(page, how) {
  if (how === 'Escape') await page.keyboard.press('Escape');
  else await page.locator('.crumbs .back').click();
  await expect(page.locator('.leave')).toBeVisible();
  await page.locator('.leave .go-leave').click();
}
const problemsOnScreen = page => page.evaluate(() => window.mathtime.game.level.facts.map(f => `${f.a} ${f.level.op} ${f.b}`));

test.describe('the tile', () => {
  test('before the try: "Daily challenge", the date and the kinds; signed in', async ({ page }) => {
    await home(page);
    await expect(tile(page).locator('.title')).toHaveText('Daily challenge');
    // "20 problems, one try"; "one try" alone where that doesn't fit.
    await expect(tile(page).locator('.name')).toHaveText(/^Sat 14 Nov · (20 problems, )?one try$/);
    await expect(tile(page).locator('.kinds')).toBeVisible();
    await expect(tile(page).locator('.result')).toBeHidden();
    await expect(tile(page)).toHaveAttribute('aria-label', 'Daily challenge, Sat 14 Nov: 20 problems, one try');
    // Above the topics, and the first in the list.
    const [t, first] = await page.evaluate(() => [document.querySelector('.select .daily'), document.querySelector('.select .group .row')].map(e => e.getBoundingClientRect().bottom));
    expect(t).toBeLessThan(first);
  });

  test('after the try: the time and the place, with the check', async ({ page, api }) => {
    api.seedDaily(DATE, [{ name: 'maya', totalMs: 1 }, { name: 'kit', totalMs: null, reached: 3 }]);
    await home(page);
    await start(page);
    await finish(page);
    await page.locator('.dboard .levels').press('Enter');
    await atSelect(page);
    const t = await kept(page);
    // As a finished row: the place under the title, the time under the check.
    await expect(tile(page).locator('.name')).toHaveText(/^(Sat 14 Nov · )?2nd of 3$/);
    await expect(tile(page).locator('.best')).toHaveText(new RegExp(`^${Math.floor(t.totalMs / 60000)}:\\d\\d\\.\\d$`));
    await expect(tile(page)).toHaveClass(/\bfinished\b/);
    await expect(tile(page).locator('.tick')).toBeVisible();
    await expect(tile(page).locator('.kinds')).toBeHidden();
    await expect(tile(page)).toHaveAttribute('aria-label', /^Daily challenge, Sat 14 Nov: \d:\d\d\.\d, 2nd of 3\. Show the board$/);
    await expect(tile(page)).toBeFocused();
  });

  test('out: "Out at N of 20", the place and a lost heart', async ({ page, api }) => {
    api.seedDaily(DATE, [{ name: 'maya', totalMs: 60_000 }]);
    await home(page);
    await start(page);
    await playTo(page, 4);
    await goOut(page);
    await atBoard(page);
    await page.keyboard.press('Escape');
    await atSelect(page);
    await expect(tile(page).locator('.name')).toHaveText(/^(Sat 14 Nov · )?2nd of 2$/);
    await expect(tile(page).locator('.best')).toHaveText('Out at 4');
    await expect(tile(page).locator('.heart')).toBeVisible();
  });

  test.describe('signed out', () => {
    test.use({ account: null });

    test('before, after and out: no place, as you aren\'t on the board', async ({ page }) => {
      await home(page);
      await expect(tile(page).locator('.name')).toHaveText(/^Sat 14 Nov · (20 problems, )?one try$/);
      await expect(tile(page)).not.toHaveClass(/\blocked\b/);
      await start(page);
      await playTo(page, 12);
      await goOut(page);
      await atBoard(page);
      await page.keyboard.press('Escape');
      await expect(tile(page).locator('.name')).toHaveText('Sat 14 Nov');
      await expect(tile(page).locator('.best')).toHaveText('Out at 12');
    });

    test('after a finished try, the time alone', async ({ page }) => {
      await home(page);
      await start(page);
      await finish(page);
      await page.keyboard.press('Escape');
      await expect(tile(page).locator('.name')).toHaveText('Sat 14 Nov');
      await expect(tile(page).locator('.best')).toHaveText(/^\d:\d\d\.\d$/);
    });
  });
});

test.describe('the try', () => {
  test('the run: "Levels › Daily challenge", 3 lives, "Question N of 20" and the bar', async ({ page }) => {
    await home(page);
    await start(page);
    await expect(page.locator('.crumbs .here')).toHaveText('Daily challenge');
    await expect(page.locator('.crumbs .back')).toBeVisible();
    await expect(page.locator('.lives svg:not(.lost)')).toHaveCount(3);
    await expect(page.locator('#qnum')).toHaveText('Question 1 of 20');
    await expect(page.locator('.run > span')).toHaveCount(20);
    await answerOne(page);
    await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
    await expect(page.locator('.run > span.done')).toHaveCount(1);
  });

  test('each problem is its own level\'s: its operator, and the box never resizes', async ({ page }) => {
    await home(page);
    await start(page);
    const twenty = dailyProblems(DATE, LEVELS);
    // Its size: the equation is centred on each problem's own ink, so it moves.
    const size = async () => {
      const { width, height } = await page.locator('#slot').boundingBox();
      return { width, height, font: await page.evaluate(() => getComputedStyle(document.querySelector('#eq')).fontSize) };
    };
    const box = await size();
    for (let q = 1; q <= 20; q++) {
      const p = twenty[q - 1];
      await expect(page.locator('#eq .op').first()).toHaveText(p.level.op);
      await expect(page.locator('#a')).toHaveText(String(p.a));
      await expect(page.locator('#b')).toHaveText(String(p.b));
      expect(await size()).toEqual(box);
      if (q < 20) await answerOne(page);
    }
  });

  test('one scored try: finished, the board shows, and the tile then opens the board', async ({ page, api }) => {
    await home(page);
    await start(page);
    await finish(page);
    await expect(page.locator('.crumbs .here')).toHaveText('Daily challenge');
    await expect(page.locator('.dboard .title')).toHaveText('Sat 14 Nov');
    await expect(page.locator('.finish')).toBeHidden();
    await page.keyboard.press('Escape');
    await atSelect(page);
    await tile(page).click();
    await atBoard(page);
    await expect(page.locator('.dboard .practice')).toBeVisible();
    expect(posts(api)).toHaveLength(1);
  });

  test('the try never counts toward a level\'s best, nor is kept as a run', async ({ page }) => {
    await home(page);
    const runs = await page.evaluate(() => localStorage.getItem('mathtime.runs'));
    await start(page);
    await finish(page);
    expect(await page.evaluate(() => localStorage.getItem('mathtime.runs'))).toBe(runs);
    await page.keyboard.press('Escape');
    for (const n of [1, 2, 3, 4]) await expect(levelRow(page, n)).not.toHaveClass(/\bfinished\b/);
  });

  test('leaving partway by "Levels" counts as out at that question', async ({ page, api }) => {
    await home(page);
    await start(page);
    await playTo(page, 6);
    await leave(page, 'Levels');
    await atSelect(page);
    await expect(tile(page)).toBeFocused();
    await expect.poll(() => posts(api).length).toBe(1);
    const { record } = posts(api)[0].body;
    expect(record).toMatchObject({ daily: true, out: true, reached: 6 });
    expect(record.problems).toHaveLength(6);
    await expect(tile(page).locator('.name')).toHaveText(/1st of 1$/);
    await expect(tile(page).locator('.best')).toHaveText('Out at 6');
    // The tile now opens the board, not a second try, once the double tap
    // of the tap on "Levels" is over: a tap before then is ignored.
    await expect(async () => {
      await tile(page).click();
      await expect(page.locator('body')).toHaveClass(/\bat-daily\b/, { timeout: 200 });
    }).toPass();
  });

  test('leaving partway by Esc counts as out too', async ({ page }) => {
    await home(page);
    await start(page);
    await answerOne(page);
    await leave(page, 'Escape');
    await atSelect(page);
    expect(await kept(page)).toMatchObject({ ended: true, out: true, reached: 2, how: 'left' });
  });

  test('a reload partway counts as out where it was, and goes up', async ({ page, api }) => {
    await home(page);
    await start(page);
    await answerOne(page);
    await answerOne(page);
    const wrong = await page.evaluate(() => (window.mathtime.game.state.problem.answer + 1) % 10);
    await typeKeys(page, [String(wrong), 'Enter']);    // a miss on question 3
    await page.waitForFunction(() => window.mathtime.game.state.lives === 2);
    await page.reload();
    await loaded(page);
    await expect(tile(page).locator('.best')).toHaveText('Out at 3');
    await expect.poll(() => posts(api).length).toBe(1);
    const { date, record } = posts(api)[0].body;
    expect(date).toBe(DATE);
    expect(record).toMatchObject({ daily: true, out: true, reached: 3 });
    expect(record.problems).toHaveLength(3);
    expect('totalMs' in record).toBe(false);
  });

  test('a reload on the first problem counts as out at 1', async ({ page }) => {
    await home(page);
    await start(page);
    await page.reload();
    await loaded(page);
    await expect(tile(page).locator('.name')).toHaveText(/1st of 1$/);
    await expect(tile(page).locator('.best')).toHaveText('Out at 1');
  });

  test('the same 20 problems on the same date, in every browser', async ({ page, browser, baseURL }) => {
    await home(page);
    await start(page);
    const here = await problemsOnScreen(page);
    const other = await browser.newContext({ baseURL, timezoneId: 'UTC' });
    await onTheDay(other, new Date('2026-11-14T23:30:00Z'));
    await withAccount(other, null);
    const page2 = await other.newPage();
    await home(page2);
    await start(page2);
    expect(await problemsOnScreen(page2)).toEqual(here);
    expect(here).toEqual(dailyProblems(DATE, LEVELS).map(p => `${p.a} ${p.level.op} ${p.b}`));
    await other.close();
  });

  test('Practice replays the same 20, unscored, and ends on the board', async ({ page, api }) => {
    await home(page);
    await start(page);
    const scored = await problemsOnScreen(page);
    await playTo(page, 3);
    await goOut(page);
    await atBoard(page);
    await expect.poll(() => posts(api).length).toBe(1);
    const before = await kept(page);
    await page.locator('.dboard .practice').click();
    await page.waitForFunction(() => !document.body.classList.contains('at-daily'));
    await expect(page.locator('.crumbs .here')).toHaveText(/^Daily( challenge)?$/);
    expect(await problemsOnScreen(page)).toEqual(scored);
    await finish(page);
    await expect(page.locator('#status')).toHaveText(/^Practice: \d:\d\d\.\d$/);
    // Leaving a practice partway is no out either.
    await page.locator('.dboard .practice').click();
    await page.waitForFunction(() => !document.body.classList.contains('at-daily'));
    await page.keyboard.press('Escape');
    await atSelect(page);
    expect(await kept(page)).toEqual(before);
    expect(posts(api)).toHaveLength(1);
    await expect(tile(page).locator('.name')).toHaveText(/1st of 1$/);
    await expect(tile(page).locator('.best')).toHaveText('Out at 3');
  });
});

test.describe('the board', () => {
  test('fastest first, then the outs by how far they got; your row marked', async ({ page, api }) => {
    // maya in no time at all, so she is ahead of sam's try, answered at once.
    api.seedDaily(DATE, [
      { name: 'rowan', reached: 5 }, { name: 'maya', totalMs: 0 }, { name: 'kit', reached: 12 },
      { name: 'jonah', totalMs: 61_900 }, { name: 'priya', totalMs: 9_999_000 },
    ]);
    await home(page);
    await start(page);
    await finish(page);
    await expect(page.locator('.dboard .rows > li')).toHaveCount(6);
    const rows = await rowsText(page);
    expect(rows[1]).toMatch(/^[12] sam 0:0\d\.\d$/);
    expect(rows.toSpliced(1, 1)).toEqual(['1 maya 0:00.0', '3 jonah 1:01.9', '4 priya 166:39.0', '5 kit Out at 12', '6 rowan Out at 5']);
    await expect(page.locator('.dboard .rows > li.you')).toHaveCount(1);
    await expect(page.locator('.dboard .rows > li').nth(1)).toHaveClass(/\byou\b/);
    await expect(page.locator('.dboard .rows > li').nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.dboard .rows > li.out')).toHaveCount(2);
    await expect(page.locator('.dboard .mine')).toBeEmpty();
    await expect(page.locator('.dboard .practice')).toBeFocused();
  });

  test('ties share a place', async ({ page, api }) => {
    api.seedDaily(DATE, [{ name: 'maya', reached: 4 }, { name: 'kit', reached: 4 }, { name: 'jonah', reached: 2 }]);
    await home(page);
    await start(page);
    await finish(page);
    await expect(page.locator('.dboard .rows > li')).toHaveCount(4);
    expect((await rowsText(page)).slice(1)).toEqual(['2 maya Out at 4', '2 kit Out at 4', '4 jonah Out at 2']);
  });

  test('a long board scrolls its rows alone, a whole number of rows, your row in view', async ({ page, api }) => {
    api.seedDaily(DATE, Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, totalMs: i < 25 ? 1_000 * i : 999_000 + i })));
    await home(page);
    await start(page);
    await finish(page);
    const rows = page.locator('.dboard .rows');
    await expect(rows).toHaveClass(/\bscrolls\b/);
    const m = await rows.evaluate(el => ({ h: el.clientHeight, top: el.scrollTop, you: el.querySelector('.you').offsetTop - el.firstElementChild.offsetTop }));
    expect((m.h - 2) % 40, 'whole rows, and the 1px rules').toBe(0);
    expect(m.you).toBeGreaterThanOrEqual(m.top);
    expect(m.you + 40).toBeLessThanOrEqual(m.top + m.h);
    await expect(page.locator('.dboard .practice')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.dboard .title')).toBeInViewport({ ratio: 1 });
  });

  test('offline: your score, and "The board will show when you\'re back online"', async ({ page, api }) => {
    api.answer[`/api/daily/${DATE}`] = () => 'down';
    await home(page);
    await start(page);
    await playTo(page, 9);
    await goOut(page);
    await atBoard(page);
    await expect(page.locator('.dboard .note')).toHaveText('The board will show when you’re back online');
    await expect(page.locator('.dboard .mine .r')).toHaveText(/–\s*sam\s*Out at 9/);
    await expect(page.locator('.dboard .rows')).toBeHidden();
    await expect(page.locator('.dboard .swap')).toHaveCount(0);
  });

  test('offline with the board kept from before: the kept board', async ({ page, api }) => {
    await home(page);
    await start(page);
    await finish(page);
    await expect(page.locator('.dboard .rows > li.you')).toHaveCount(1);
    api.answer[`/api/daily/${DATE}`] = () => 'down';
    await page.reload();
    await loaded(page);
    await expect(tile(page).locator('.name')).toHaveText(/1st of 1$/);
    await tile(page).click();
    await atBoard(page);
    await expect(page.locator('.dboard .rows > li.you')).toHaveCount(1);
    await expect(page.locator('.dboard .note')).toHaveCount(0);
  });

  test('a bad date is a 400 from the API', async ({ page, api }) => {
    await home(page);
    const status = await page.evaluate(() => fetch('/api/daily/2026-13-45').then(r => r.status));
    expect(status).toBe(400);
  });
});

test.describe('signed out', () => {
  test.use({ account: null });

  test('your score above the board, "Log in to be on tomorrow\'s board", which logs in; never uploaded', async ({ page, api }) => {
    api.seedDaily(DATE, [{ name: 'maya', totalMs: 58_700 }, { name: 'kit', totalMs: 64_200 }]);
    await home(page);
    await start(page);
    await finish(page);
    await expect(page.locator('.dboard .mine .r')).toHaveText(/–\s*You\s*\d:\d\d\.\d/);
    await expect(page.locator('.dboard .rows > li')).toHaveCount(2);
    await expect(page.locator('.dboard .rows > li.you')).toHaveCount(0);
    const link = page.locator('.dboard .swap');
    await expect(link).toHaveText('Log in to be on tomorrow’s board');
    await link.click();
    await expect(page.locator('body')).toHaveClass(/\bat-login\b/);
    await page.locator('#f-name').fill('sam');
    await page.locator('#f-pass').fill('password1');
    await page.keyboard.press('Enter');
    await atBoard(page);
    await page.evaluate(() => window.mathtime.account.settled());
    // Signed in now, but the try ended signed out: still never sent, and
    // the board says so, with no link.
    await expect(page.locator('.dboard .mine .note')).toHaveText('Played signed out: not on today’s board');
    await expect(page.locator('.dboard .swap')).toHaveCount(0);
    expect(posts(api)).toHaveLength(0);
    expect((await outbox(page)).filter(e => e.daily)).toEqual([]);
    expect(await kept(page)).toMatchObject({ ended: true, name: null });
  });

  test('Esc from that log in goes back to the board', async ({ page }) => {
    await home(page);
    await start(page);
    await finish(page);
    await page.locator('.dboard .swap').click();
    await page.keyboard.press('Escape');
    await atBoard(page);
  });
});

test.describe('the upload', () => {
  test('201: sent once, as {date, record}, and the outbox is empty', async ({ page, api }) => {
    await home(page);
    await start(page);
    await finish(page);
    await expect.poll(() => posts(api).length).toBe(1);
    const { date, record } = posts(api)[0].body;
    expect(date).toBe(DATE);
    expect(record).toMatchObject({ daily: true, out: false, reached: 20 });
    expect(record.totalMs).toBeGreaterThan(0);
    expect(record.problems).toHaveLength(20);
    expect('level' in record).toBe(false);
    expect(api.daily.get(DATE).map(e => e.name)).toEqual(['sam']);
    expect(await outbox(page)).toEqual([]);
  });

  test('409 "taken": done, the outbox emptied', async ({ page, api }) => {
    api.answer['/api/daily'] = () => ({ status: 409, body: { error: 'taken' } });
    await home(page);
    await start(page);
    await finish(page);
    await expect.poll(() => posts(api).length).toBe(1);
    await expect.poll(() => outbox(page)).toEqual([]);
  });

  test('400: dropped', async ({ page, api }) => {
    api.answer['/api/daily'] = () => ({ status: 400, body: { error: 'record' } });
    await home(page);
    await start(page);
    await finish(page);
    await expect.poll(() => outbox(page)).toEqual([]);
  });

  test('a failure waits in the outbox for this account, and goes up on the next load', async ({ page, api }) => {
    api.answer['/api/daily'] = () => 'down';
    await home(page);
    await start(page);
    await finish(page);
    await expect.poll(() => posts(api).length).toBe(1);
    const waiting = await outbox(page);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ name: 'sam', daily: { date: DATE } });
    delete api.answer['/api/daily'];
    await page.reload();
    await loaded(page);
    await expect.poll(() => posts(api).length).toBe(2);
    expect(posts(api)[1].body).toEqual(posts(api)[0].body);
    await expect.poll(() => outbox(page)).toEqual([]);
    await expect(tile(page).locator('.name')).toHaveText(/1st of 1$/);
  });

  test('a 5xx waits too', async ({ page, api }) => {
    api.answer['/api/daily'] = () => ({ status: 503, body: {} });
    await home(page);
    await start(page);
    await finish(page);
    await expect.poll(() => posts(api).length).toBe(1);
    expect(await outbox(page)).toHaveLength(1);
  });

  test('401: signed out, and the try waits for its own account', async ({ page, api }) => {
    await home(page);
    api.session = null;
    await start(page);
    await finish(page);
    await expect.poll(() => page.evaluate(() => window.mathtime.account.name)).toBe(null);
    expect(await outbox(page)).toEqual([expect.objectContaining({ name: 'sam' })]);
  });
});

// ---------- Two tabs ----------

const IN_PROGRESS = 'In progress in another tab';
const BUSY = 'The board is busy: try again in a minute';

test.describe('two tabs', () => {
  test('a new tab neither ends a try being played in another, nor previews it by Practice', async ({ page, context, api }) => {
    await home(page);
    await start(page);
    await answerOne(page);
    const other = await context.newPage();
    await home(other);
    await expect(tile(other).locator('.name')).toHaveText(IN_PROGRESS);
    await expect(tile(other)).toHaveAttribute('aria-label', `Daily challenge: ${IN_PROGRESS}`);
    // A tap says so, and starts nothing; nor does Practice, the board's.
    await tile(other).click();
    await expect(other.locator('#status')).toHaveText(IN_PROGRESS);
    await expect(other.locator('body')).toHaveClass(/\bat-select\b/);
    await other.evaluate(() => window.mathtime.playDaily(true));
    await expect(other.locator('body')).toHaveClass(/\bat-select\b/);
    expect(await kept(other)).toMatchObject({ started: true, ended: false, reached: 2 });
    expect(posts(api)).toHaveLength(0);
    // The first tab plays on to the end; the other hears it.
    await expect(page.locator('#qnum')).toHaveText('Question 2 of 20');
    await finish(page);
    await expect.poll(() => posts(api).length).toBe(1);
    expect(posts(api)[0].body.record).toMatchObject({ out: false, reached: 20 });
    await expect(tile(other).locator('.name')).toHaveText(/1st of 1$/);
    await expect(tile(other).locator('.best')).toHaveText(/^\d:\d\d\.\d$/);
  });

  test('a tab whose try another tab ended stops, and shows the board', async ({ page, context }) => {
    await home(page);
    await start(page);
    await answerOne(page);
    const other = await context.newPage();
    await home(other);
    // As a tab without Web Locks would, finding it unended.
    await other.evaluate(d => {
      const all = JSON.parse(localStorage.getItem('mathtime.daily'));
      Object.assign(all[d], { ended: true, out: true, reached: 2, name: 'sam' });
      localStorage.setItem('mathtime.daily', JSON.stringify(all));
    }, DATE);
    await atBoard(page);
    await expect(page.locator('#status')).toHaveText('Your try ended in another tab');
    await expect(page.locator('.dboard .practice')).toBeVisible();
  });

  test('a closed tab\'s try is cut off when another taps the tile, as its owner', async ({ page, context, api }) => {
    await home(page);
    await start(page);
    await answerOne(page);
    const other = await context.newPage();
    await home(other);
    await expect(tile(other).locator('.name')).toHaveText(IN_PROGRESS);
    await page.close();
    await tile(other).click();
    await atBoard(other);
    expect(await kept(other)).toMatchObject({ ended: true, out: true, reached: 2, name: 'sam' });
    await expect.poll(() => posts(api).length).toBe(1);
    expect(posts(api)[0].body).toMatchObject({ date: DATE, name: 'sam', record: { out: true, reached: 2 } });
  });

  test('a try cut off by a reload goes to the account it was played in, whoever is signed in after', async ({ page, api }) => {
    await home(page);
    await start(page);
    await answerOne(page);
    // Signed in as someone else meanwhile, in another tab: the cached name changes.
    await page.evaluate(() => localStorage.setItem('mathtime.account', JSON.stringify({ name: 'alex' })));
    api.users.set('alex', { name: 'alex', password: 'password2' });
    api.session = 'alex';
    await page.reload();
    await loaded(page);
    await expect.poll(() => outbox(page)).toEqual([expect.objectContaining({ name: 'sam', daily: expect.objectContaining({ date: DATE }) })]);
    expect(posts(api)).toHaveLength(0);
  });
});

// ---------- The day: midnight, and the player's own time zone ----------

test('at midnight the tile turns to the new day', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, timezoneId: 'UTC' });
  await onTheDay(context, new Date('2026-11-14T23:59:58Z'));
  const api = await withAccount(context);
  api.now = () => Date.parse('2026-11-14T23:59:58Z');
  const page = await context.newPage();
  try {
    await home(page);
    await expect(tile(page).locator('.name')).toHaveText(/^Sat 14 Nov · (20 problems, )?one try$/);
    await expect(tile(page).locator('.name')).toHaveText(/^Sun 15 Nov · /, { timeout: 10_000 });
    await expect(tile(page)).toHaveAttribute('aria-label', 'Daily challenge, Sun 15 Nov: 20 problems, one try');
  } finally {
    await context.close();
  }
});

// 12:00 UTC on 14 Nov is 01:00 on the 15th in Auckland; 05:00 UTC is 21:00
// on the 13th in Los Angeles. The day is the player's own.
for (const [zone, at, date, label] of [['Pacific/Auckland', '2026-11-14T12:00:00Z', '2026-11-15', 'Sun 15 Nov'], ['America/Los_Angeles', '2026-11-14T05:00:00Z', '2026-11-13', 'Fri 13 Nov']]) {
  test(`in ${zone}, the day is the player's own: ${label}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, timezoneId: zone });
    await onTheDay(context, new Date(at));
    const api = await withAccount(context);
    api.now = () => Date.parse(at);
    const page = await context.newPage();
    try {
      await home(page);
      await expect(tile(page).locator('.name')).toHaveText(new RegExp(`^${label} · `));
      await start(page);
      expect(await problemsOnScreen(page)).toEqual(dailyProblems(date, LEVELS).map(p => `${p.a} ${p.level.op} ${p.b}`));
      await finish(page);
      await expect.poll(() => posts(api).length).toBe(1);
      expect(posts(api)[0].body.date).toBe(date);
      expect(api.daily.get(date)?.map(e => e.name)).toEqual(['sam']);
      await expect(page.locator('.dboard .title')).toHaveText(label);
    } finally {
      await context.close();
    }
  });
}

test('the API refuses a date more than a day from its own', async ({ page, api }) => {
  api.now = () => Date.parse('2026-11-16T10:00:00Z');
  await home(page);
  await start(page);
  await finish(page);
  await expect.poll(() => posts(api).length).toBe(1);
  await expect.poll(() => outbox(page)).toEqual([]);
  expect(api.daily.get(DATE)).toBeUndefined();
});

// ---------- The board's other answers ----------

test('the API busy (429): "The board is busy: try again in a minute"', async ({ page, api }) => {
  api.answer[`/api/daily/${DATE}`] = (body, method) => (method === 'GET' ? { status: 429, body: { error: 'rate' } } : undefined);
  await home(page);
  await start(page);
  await finish(page);
  await expect(page.locator('.dboard .note')).toHaveText(BUSY);
  await expect(page.locator('.dboard .rows')).toBeHidden();
});

test('past the first 200, your own row comes after them, at your place, and the tile says of how many', async ({ page, api }) => {
  api.seedDaily(DATE, Array.from({ length: 250 }, (_, i) => ({ name: `p${i}`, totalMs: 60_000 + i })));
  await home(page);
  await start(page);
  await goOut(page);
  await atBoard(page);
  await expect(page.locator('.dboard .rows > li')).toHaveCount(201);
  const last = page.locator('.dboard .rows > li').last();
  await expect(last).toHaveClass(/\byou\b/);
  await expect(last.locator('.place')).toHaveText('251');
  await expect(page.locator('.dboard .rows')).toHaveCSS('--place-w', '3ch');
  // Its place column as wide as 251, the same in every row.
  const [a, b] = await page.locator('.dboard .rows > li .who').evaluateAll(w => [w[0], w.at(-1)].map(e => e.getBoundingClientRect().left));
  expect(a).toBeCloseTo(b, 2);
  await page.keyboard.press('Escape');
  await expect(tile(page).locator('.name')).toHaveText(/251st of 251$/);
  await expect(tile(page).locator('.best')).toHaveText('Out at 1');
});

test('a board kept by another account is never shown as yours', async ({ page, api }) => {
  await home(page);
  await start(page);
  await finish(page);
  await expect(page.locator('.dboard .rows > li.you')).toHaveCount(1);
  // Signed out, and the board can't be had: sam's kept board is not this one's.
  await page.keyboard.press('Escape');
  api.answer[`/api/daily/${DATE}`] = () => 'down';
  await page.locator('.top .acct').click();
  await page.locator('.top .acct').click();
  await expect(page.locator('.top .acct')).toHaveText('Log in');
  await expect(async () => {
    await tile(page).click();
    await expect(page.locator('body')).toHaveClass(/\bat-daily\b/, { timeout: 200 });
  }).toPass();
  await expect(page.locator('.dboard .note')).toHaveText('The board will show when you’re back online');
  await expect(page.locator('.dboard .rows')).toBeHidden();
  // Your own score, as the account it was played in.
  await expect(page.locator('.dboard .mine .r .who')).toHaveText('sam');
});

test('a 403 "owner" (the session is another account\'s) keeps the try for its own', async ({ page, api }) => {
  api.answer['/api/daily'] = () => ({ status: 403, body: { error: 'owner' } });
  await home(page);
  await start(page);
  await finish(page);
  await expect.poll(() => posts(api).length).toBe(1);
  expect(posts(api)[0].body.name).toBe('sam');
  expect(await outbox(page)).toEqual([expect.objectContaining({ name: 'sam' })]);
});

// ---------- The UI review: asking before leaving, Practice, the result over the board ----------

test.describe('leaving a scored try asks first', () => {
  test('"Leave? This counts as Out at N": Stay focused; Esc or Stay plays on, paused meanwhile, the clock running', async ({ page }) => {
    await home(page);
    await start(page);
    await playTo(page, 5);
    const before = await page.evaluate(() => window.mathtime.game.sofar().current.ms);
    await page.keyboard.press('Escape');
    const prompt = page.locator('.leave');
    await expect(prompt).toBeVisible();
    await expect(prompt.locator('.l-head')).toHaveText('Leave?');
    await expect(prompt.locator('#leave-text')).toHaveText('This counts as Out at 5.');
    await expect(prompt.locator('.stay')).toBeFocused();
    await expect(prompt).toHaveAttribute('role', 'alertdialog');
    // Paused: a tap on the keypad lands on the shade, and keys do nothing.
    const typed = () => page.evaluate(() => window.mathtime.game.state.typed);
    const key = await page.locator('.pad button[data-k="7"]').boundingBox();
    await page.mouse.click(key.x + key.width / 2, key.y + key.height / 2);
    await page.locator('.leave .stay').press('7');
    expect(await typed()).toBe('');
    await expect(prompt.locator('.stay')).toBeFocused();
    // Tab stays in the question.
    await page.keyboard.press('Tab');
    await expect(prompt.locator('.go-leave')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(prompt.locator('.stay')).toBeFocused();
    // Esc plays on, where it was, the clock having run.
    await page.keyboard.press('Escape');
    await expect(prompt).toBeHidden();
    await expect(page.locator('#ans')).toBeFocused();
    await expect(page.locator('#qnum')).toHaveText('Question 5 of 20');
    expect(await page.evaluate(() => window.mathtime.game.sofar().current.ms)).toBeGreaterThan(before);
    await page.keyboard.press('3');
    expect(await typed()).toBe('3');
    // "Levels", then Stay: the same.
    await page.locator('.crumbs .back').click();
    await expect(prompt).toBeVisible();
    await prompt.locator('.stay').click();
    await expect(prompt).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/\bat-select\b/);
    expect(await kept(page)).toMatchObject({ ended: false });
  });

  test('Leave ends it out, "Left at N" over the board', async ({ page }) => {
    await home(page);
    await start(page);
    await playTo(page, 5);
    await leave(page, 'Escape');
    await atSelect(page);
    await expect(async () => {
      await tile(page).click();
      await expect(page.locator('body')).toHaveClass(/\bat-daily\b/, { timeout: 200 });
    }).toPass();
    await expect(page.locator('.dboard .o-title')).toHaveText('Daily challenge: out');
    await expect(page.locator('.dboard .o-detail')).toHaveText('Left at 5');
    await expect(page.locator('.dboard .o-time')).toBeHidden();
    await expect(page.locator('.dboard .o-place')).toHaveText('1st of 1');
  });

  test('Practice and the other levels never ask', async ({ page }) => {
    await home(page);
    await start(page);
    await goOut(page);
    await atBoard(page);
    await expect(page.locator('.dboard .o-title')).toHaveText('Daily challenge: out');
    await expect(page.locator('.dboard .o-detail')).toHaveText('Out of lives at 1');
    await page.locator('.dboard .practice').click();
    await page.waitForFunction(() => !document.body.classList.contains('at-daily'));
    await page.keyboard.press('Escape');
    await atSelect(page);
    await expect(page.locator('.leave')).toBeHidden();
    await levelRow(page, 1).click();
    await page.keyboard.press('Escape');
    await atSelect(page);
    await expect(page.locator('.leave')).toBeHidden();
  });
});

test.describe('Practice shows as Practice', () => {
  test('"Levels › Daily challenge › Practice", then "Practice" and its time over the board', async ({ page }) => {
    await home(page);
    await start(page);
    await finish(page);
    await expect(page.locator('.dboard .o-title')).toHaveText('Daily challenge complete');
    await expect(page.locator('.dboard .o-time')).toHaveText(/^\d:\d\d\.\d$/);
    await expect(page.locator('.dboard .o-place')).toHaveText('1st of 1');
    await page.locator('.dboard .practice').click();
    await page.waitForFunction(() => !document.body.classList.contains('at-daily'));
    await expect(page.locator('.crumbs .here')).toBeVisible();
    await expect(page.locator('.crumbs span.sub')).toHaveText('Practice');
    await expect(page.locator('.crumbs span.sub')).toBeVisible();
    await finish(page);
    await expect(page.locator('.dboard .o-title')).toHaveText('Practice');
    await expect(page.locator('.dboard .o-time')).toHaveText(/^\d:\d\d\.\d$/);
    await expect(page.locator('.dboard .o-place')).toBeHidden();
    await expect(page.locator('.crumbs span.sub')).toBeHidden();
    // Out in practice: "Practice: out at N".
    await page.locator('.dboard .practice').click();
    await page.waitForFunction(() => !document.body.classList.contains('at-daily'));
    await playTo(page, 3);
    await goOut(page);
    await atBoard(page);
    await expect(page.locator('.dboard .o-title')).toHaveText('Practice: out at 3');
    await expect(page.locator('.dboard .o-time')).toBeHidden();
  });

  test('the Practice crumb gives way as the others do: "‹ Daily › Practice" at the narrowest', async ({ page }) => {
    await home(page);
    await start(page);
    await finish(page);
    await page.locator('.dboard .practice').click();
    await page.waitForFunction(() => !document.body.classList.contains('at-daily'));
    for (const [width, height] of [[1440, 900], [375, 812], [320, 640]]) {
      await page.setViewportSize({ width, height });
      await settle(page);
      const h = await page.evaluate(() => {
        const r = sel => document.querySelector(sel).getBoundingClientRect();
        return { sub: r('.crumbs span.sub').right, hearts: r('.lives').left, here: document.querySelector('.crumbs .here').textContent, tight: document.querySelector('.top').classList.contains('tight') };
      });
      expect(h.sub, `${width}: the crumbs clear of the hearts`).toBeLessThanOrEqual(h.hearts - 16 + 0.01);
      if (width === 1440) expect([h.tight, h.here]).toEqual([false, 'Daily challenge']);
      if (width === 320) expect([h.tight, h.here]).toEqual([true, 'Daily']);
    }
  });
});

test('the board keeps its scrollbar\'s room: the times end in the same place on a short board and a long one, the buttons\' edge less the row\'s padding', async ({ page, api }) => {
  // Stacked both times: a window too narrow for the board side by side.
  if (test.info().project.name === 'desktop') await page.setViewportSize({ width: 600, height: 900 });
  await home(page);
  await start(page);
  await finish(page);
  const edges = () => page.evaluate(() => ({
    score: document.querySelector('.dboard .rows > li .score').getBoundingClientRect().right,
    row: document.querySelector('.dboard .rows > li').getBoundingClientRect().right,
    buttons: document.querySelector('.dboard .done-buttons').getBoundingClientRect().right,
  }));
  const short = await edges();
  expect(short.row).toBeCloseTo(short.buttons, 2);
  api.seedDaily(DATE, Array.from({ length: 60 }, (_, i) => ({ name: `p${i}`, totalMs: 90_000 + i })));
  await page.keyboard.press('Escape');
  await expect(async () => {
    await tile(page).click();
    await expect(page.locator('body')).toHaveClass(/\bat-daily\b/, { timeout: 200 });
  }).toPass();
  await expect(page.locator('.dboard .rows')).toHaveClass(/\bscrolls\b/);
  const long = await edges();
  expect(long.score).toBeCloseTo(short.score, 2);
  expect(long.row).toBeCloseTo(long.buttons, 2);
});

// ---------- The server's score is the day's (the UI re-review) ----------

test.describe('played on another device', () => {
  test('signed in, the tile shows the score the API has, and opens the board, not a try', async ({ page, api }) => {
    api.seedDaily(DATE, [{ name: 'maya', totalMs: 9_000 }, { name: 'sam', totalMs: 10_000 }]);
    await home(page);
    await expect(tile(page).locator('.best')).toHaveText('0:10.0');
    await expect(tile(page).locator('.name')).toHaveText(/2nd of 2$/);
    await tile(page).click();
    await atBoard(page);
    await expect(page.locator('.dboard .o-title')).toHaveText('Daily challenge complete');
    await expect(page.locator('.dboard .o-time')).toHaveText('0:10.0');
    await expect(page.locator('.dboard .rows > li.you .score')).toHaveText('0:10.0');
    expect(await page.evaluate(() => window.mathtime.game.level.daily ?? null)).toBe(null);
    expect(posts(api)).toHaveLength(0);
    expect(await kept(page)).toMatchObject({ ended: true, out: false, totalMs: 10_000, name: 'sam' });
  });

  test('an out there is an out here: "Out at N"', async ({ page, api }) => {
    api.seedDaily(DATE, [{ name: 'sam', reached: 7 }]);
    await home(page);
    await expect(tile(page).locator('.best')).toHaveText('Out at 7');
    await tile(page).click();
    await atBoard(page);
    await expect(page.locator('.dboard .o-detail')).toHaveText('Out at 7');
  });

  test('played there after this tab loaded: checked again before the try starts', async ({ page, api }) => {
    await home(page);
    await expect(tile(page).locator('.name')).toHaveText(/one try$/);
    api.seedDaily(DATE, [{ name: 'sam', totalMs: 10_000 }]);
    await tile(page).click();
    await atBoard(page);
    await expect(page.locator('.dboard .o-time')).toHaveText('0:10.0');
    expect(posts(api)).toHaveLength(0);
  });

  test('a try the API refuses (409: it keeps the first) gives way to the API\'s score, on the board and the tile', async ({ page, api }) => {
    await home(page);
    await start(page);
    // Played on another device meanwhile.
    api.seedDaily(DATE, [{ name: 'sam', totalMs: 10_000 }]);
    await finish(page);
    await expect.poll(() => posts(api).length).toBe(1);
    await expect(page.locator('.dboard .o-time')).toHaveText('0:10.0');
    await expect(page.locator('.dboard .rows > li.you .score')).toHaveText('0:10.0');
    expect(await kept(page)).toMatchObject({ ended: true, totalMs: 10_000 });
    await page.keyboard.press('Escape');
    await expect(tile(page).locator('.best')).toHaveText('0:10.0');
    await expect.poll(() => outbox(page)).toEqual([]);
  });

  test.describe('signed out', () => {
    test.use({ account: null });
    test('this browser\'s own state stands', async ({ page, api }) => {
      api.seedDaily(DATE, [{ name: 'sam', totalMs: 10_000 }]);
      await home(page);
      await expect(tile(page).locator('.name')).toHaveText(/one try$/);
    });
  });
});

// A board of seven: it never scrolls on a laptop or a desktop (side by side
// where it wouldn't show whole stacked); a phone may scroll it.
test.describe('a board of seven', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name === 'phone', 'own contexts, from the desktop browser'));
  for (const [width, height, dpr] of [[1366, 657, 1], [1280, 610, 1.5], [1536, 730, 1.25], [1440, 900, 1], [1920, 1080, 1]]) {
    test(`shows whole at ${width}×${height}@${dpr}, buttons and all`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, baseURL, timezoneId: 'UTC' });
      await onTheDay(context);
      const api = await withAccount(context);
      api.now = () => DAY_START.getTime();
      api.seedDaily(DATE, ['maya', 'jonah', 'priya', 'alexandra-whitfield', 'kit', 'rowan'].map((name, i) => ({ name, totalMs: 58_700 + 3_000 * i })));
      const page = await context.newPage();
      try {
        await home(page);
        await start(page);
        await finish(page);
        await expect(page.locator('.dboard .rows > li')).toHaveCount(7);
        await settle(page);
        await expect(page.locator('.dboard .rows')).not.toHaveClass(/\bscrolls\b/);
        const fits = await page.evaluate(() => {
          const rows = document.querySelector('.dboard .rows');
          return rows.scrollHeight <= rows.clientHeight;
        });
        expect(fits, 'every row shows').toBe(true);
        await expect(page.locator('.dboard .practice')).toBeInViewport({ ratio: 1 });
        await expect(page.locator('.dboard .rows > li').last()).toBeInViewport({ ratio: 1 });
        expect(await overflowing(page), 'nothing else scrolls').toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

// ---------- Nothing overflows, at every size we check ----------

const SIZES = [[375, 812, 2], [320, 640, 2], [844, 390, 3], [1366, 657, 1], [1536, 730, 1.25], [1280, 610, 1.5], [1440, 900, 1], [1920, 1080, 1]];
// What may scroll by design: the selector on a phone (its one stacked
// column, or its topic columns held sideways: selector.js), and the
// board's rows; what clips: the problem area and the live region,
// and a name too long for its row, which ends in "…".
const overflowing = page => page.evaluate(() => {
  const name = el => el.tagName.toLowerCase() + [...el.classList].map(c => `.${c}`).join('');
  const found = [];
  for (const el of document.querySelectorAll('*')) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    const can = v => v === 'auto' || v === 'scroll', clips = v => v === 'hidden' || v === 'clip';
    const scrolls = (can(cs.overflowY) && el.scrollHeight > el.clientHeight) || (can(cs.overflowX) && el.scrollWidth > el.clientWidth);
    const designed = el.matches('.dboard .rows.scrolls') || (el.matches('.select') && matchMedia('(pointer: coarse)').matches);
    if (scrolls && !designed) found.push(`${name(el)} scrolls`);
    if (el.matches('.stage, .sr-only, .dboard .who') || cs.visibility === 'hidden') continue;
    if ((clips(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) || (clips(cs.overflowX) && el.scrollWidth > el.clientWidth + 1)) found.push(`${name(el)} clips`);
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 0.5 && !el.closest('.crumbs, .acct, .sr-only')) found.push(`${name(el)} past the right edge`);
  }
  const doc = document.scrollingElement;
  if (doc.scrollHeight > doc.clientHeight || doc.scrollWidth > doc.clientWidth) found.push('the document scrolls');
  return found;
});

test.describe('fits', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name === 'phone', 'own contexts, from the desktop browser (real scrollbars)'));

  for (const [width, height, dpr] of SIZES) {
    test(`${width}×${height}@${dpr}: the tile, the play screen and the board`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, baseURL, timezoneId: 'UTC', isMobile: width < 900 && dpr > 1, hasTouch: width < 900 && dpr > 1 });
      await onTheDay(context);
      const api = await withAccount(context);
      api.now = () => DAY_START.getTime();
      api.seedDaily(DATE, Array.from({ length: 30 }, (_, i) => ({ name: i === 4 ? 'alexandra-whitfield' : `player${i}`, totalMs: i < 25 ? 50_000 + 1_000 * i : null, reached: 10 })));
      const page = await context.newPage();
      try {
        await home(page);
        await settle(page);
        expect(await overflowing(page), 'the selector, before').toEqual([]);
        // The line under the tile's title keeps 15px clear of the kinds.
        const clear = await tile(page).evaluate(t => {
          const range = document.createRange();
          range.selectNodeContents(t.querySelector('.name'));
          return t.querySelector('.kinds > span').getBoundingClientRect().left - range.getBoundingClientRect().right;
        });
        expect(clear, 'the tile\'s line clear of the kinds').toBeGreaterThanOrEqual(15);
        await start(page);
        // The question to leave fits too, and Stay plays on.
        await page.keyboard.press('Escape');
        await expect(page.locator('.leave')).toBeVisible();
        await settle(page);
        expect(await overflowing(page), 'the question to leave').toEqual([]);
        const panel = await page.locator('.leave').boundingBox();
        expect(panel.x, 'the question inside the window').toBeGreaterThanOrEqual(16);
        expect(panel.y).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width).toBeLessThanOrEqual(width - 16);
        expect(panel.y + panel.height).toBeLessThanOrEqual(height);
        await page.locator('.leave .stay').click();
        await expect(page.locator('.leave')).toBeHidden();
        for (let q = 1; q <= 20; q++) {
          await settle(page);
          expect(await overflowing(page), `question ${q}`).toEqual([]);
          if (q < 20) await playTo(page, q + 1);
        }
        await answer(page);
        await atBoard(page);
        await settle(page);
        expect(await overflowing(page), 'the board').toEqual([]);
        // Practice: its crumb, its play screen and its result over the board.
        await page.locator('.dboard .practice').click();
        await page.waitForFunction(() => !document.body.classList.contains('at-daily'));
        await settle(page);
        expect(await overflowing(page), 'practice').toEqual([]);
        await finish(page);
        await settle(page);
        expect(await overflowing(page), 'the board after practice').toEqual([]);
        await page.keyboard.press('Escape');
        await settle(page);
        expect(await overflowing(page), 'the selector, after').toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
