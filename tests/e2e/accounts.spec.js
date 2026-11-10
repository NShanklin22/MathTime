import { test, expect, withAccount, fakeApi } from './fixtures.js';
import { levelRow, finishRun, settle, capture, ink, MUTED } from './helpers.js';
import { formatTime } from '../../src/finish.js';

// Accounts (2026-11-09-accounts-design.md, the accounts mockup): the locks,
// the header link, the log-in screen, the cached sign-in and the upload of
// finished runs. The API is the fake in fixtures.js: sam / password1, the
// invite TEST-INVITE.

const loaded = page => page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
async function home(page) {
  await page.goto('/');
  await loaded(page);
}
const acct = page => page.locator('.top .acct');
const field = (page, name) => page.locator(`#f-${name}`);
const error = page => page.locator('.login .error');
const atLogin = page => expect(page.locator('body')).toHaveClass(/\bat-login\b/);
const atSelect = page => expect(page.locator('body')).toHaveClass(/\bat-select\b/);
// The ids waiting to go up, and the whole entries ({id, name}).
const outbox = page => page.evaluate(() => (JSON.parse(localStorage.getItem('mathtime.outbox')) ?? []).map(e => e.id));
const entries = page => page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.outbox')) ?? []);
const kept = page => page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.runs')) ?? []);
const posts = (api, id) => api.requests.filter(r => r.path === '/api/runs' && (id === undefined || r.body?.id === id));
const earlier = (id, level, totalMs) => ({ id, level, finishedAt: '2026-11-01T09:30:00.000Z', totalMs, misses: 0, problems: [{ a: 1, b: 2, ms: totalMs, misses: 0 }] });
const keptBefore = (page, records) => page.addInitScript(r => {
  if (localStorage.getItem('mathtime.runs') === null) localStorage.setItem('mathtime.runs', JSON.stringify(r));
}, records);

async function logIn(page, name = 'sam', password = 'password1') {
  await field(page, 'name').fill(name);
  await field(page, 'pass').fill(password);
  await page.keyboard.press('Enter');
}

test.describe('signed out', () => {
  test.use({ account: null });

  test('levels 5–7 are locked, 1–4 free, and the header link reads "Log in"', async ({ page }) => {
    await home(page);
    await expect(acct(page)).toHaveText('Log in');
    await expect(acct(page)).toBeVisible();
    for (const n of [1, 2, 3, 4]) {
      await expect(levelRow(page, n)).not.toHaveClass(/\blocked\b/);
      await expect(levelRow(page, n).locator('.lock')).toBeHidden();
      await expect(levelRow(page, n).locator('.sample')).toBeVisible();
    }
    for (const n of [5, 6, 7]) {
      await expect(levelRow(page, n)).toHaveClass(/\blocked\b/);
      await expect(levelRow(page, n).locator('.lock')).toBeVisible();
      await expect(levelRow(page, n).locator('.sample')).toBeHidden();
      await expect(levelRow(page, n)).toHaveAttribute('aria-label', /, locked: log in to play$/);
    }
    // The lock's box ends at the row's padding edge, where the samples' ink does.
    const gap = await page.evaluate(() => {
      const row = document.querySelector('.row[data-level="6"]');
      return row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight) - row.querySelector('.lock').getBoundingClientRect().right;
    });
    expect(Math.abs(gap)).toBeLessThan(0.01);
  });

  test('a locked row opens log in; once in, that level starts', async ({ page, api }) => {
    await home(page);
    await levelRow(page, 6).click();
    await atLogin(page);
    await expect(page.locator('.crumbs .here')).toHaveText('Log in');
    await expect(page.locator('.crumbs .back')).toBeVisible();
    await expect(page.locator('.pad')).toBeHidden();
    await expect(page.locator('.lives')).toBeHidden();
    await expect(acct(page)).toBeHidden();
    await expect(field(page, 'name')).toBeFocused();
    await expect(field(page, 'invite')).toBeHidden();
    await logIn(page);
    await expect(page.locator('body')).not.toHaveClass(/\bat-(login|select)\b/);
    await expect(page.locator('body')).toHaveAttribute('data-kind', 'column');
    await expect(page.locator('.crumbs .here')).toHaveText('Addition 2');
    await expect(page.locator('#ans')).toBeFocused();
    expect(await page.evaluate(() => window.mathtime.game.level.n)).toBe(6);
    expect(api.requests.find(r => r.path === '/api/login').body).toEqual({ name: 'sam', password: 'password1' });
  });

  test('a free row starts its level signed out', async ({ page }) => {
    await home(page);
    await levelRow(page, 4).click();
    await expect(page.locator('body')).not.toHaveClass(/\bat-(login|select)\b/);
  });

  test('typing in the log-in fields never reaches the game', async ({ page }) => {
    await home(page);
    await acct(page).click();
    await page.keyboard.type('sam12');
    await expect(field(page, 'name')).toHaveValue('sam12');
    await expect(field(page, 'name')).toBeFocused();
  });

  test('Esc and the "Levels" link go back without logging in, the focus where you came from', async ({ page, api }) => {
    await home(page);
    await levelRow(page, 7).focus();
    await page.keyboard.press('Enter');
    await atLogin(page);
    await field(page, 'name').fill('sam');
    await page.keyboard.press('Escape');
    await atSelect(page);
    await expect(levelRow(page, 7)).toBeFocused();
    await expect(levelRow(page, 7)).toHaveClass(/\blocked\b/);
    await acct(page).click();
    await atLogin(page);
    await expect(field(page, 'name')).toHaveValue('');             // afresh
    await page.locator('.crumbs .back').click();
    await atSelect(page);
    await expect(acct(page)).toBeFocused();
    await expect(acct(page)).toHaveText('Log in');
    expect(api.requests.filter(r => r.path === '/api/login')).toHaveLength(0);
  });

  test('Enter with a field empty moves to it, with no error and no request', async ({ page, api }) => {
    await home(page);
    await acct(page).click();
    await field(page, 'name').fill('sam');
    await page.keyboard.press('Enter');
    await expect(field(page, 'pass')).toBeFocused();
    await expect(error(page)).toBeHidden();
    await page.locator('.login .swap').click();                  // Sign up: the invite comes first
    await expect(field(page, 'invite')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(field(page, 'invite')).toBeFocused();
    expect(api.requests.filter(r => r.method === 'POST')).toHaveLength(0);
  });

  test('log in from the header link: back to the selector, the name in the link, no locks', async ({ page }) => {
    await home(page);
    await acct(page).click();
    await logIn(page);
    await atSelect(page);
    await expect(acct(page)).toHaveText('sam');
    await expect(acct(page)).toBeFocused();
    await expect(acct(page)).toHaveAttribute('aria-label', 'Signed in as sam');
    await expect(page.locator('#status')).toHaveText('Signed in as sam');
    await expect(page.locator('.select .row.locked')).toHaveCount(0);
    for (const n of [5, 6, 7]) await expect(levelRow(page, n).locator('.sample')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.account')))).toEqual({ name: 'sam' });
  });

  test('a wrong password: the error in words, the name kept, the password cleared and focused', async ({ page }) => {
    await home(page);
    await acct(page).click();
    await logIn(page, 'sam', 'wrong-one');
    await expect(error(page)).toHaveText("That name and password don't match");
    await expect(field(page, 'name')).toHaveValue('sam');
    await expect(field(page, 'pass')).toHaveValue('');
    await expect(field(page, 'pass')).toBeFocused();
    await atLogin(page);
  });

  test('sign up: every error, then in', async ({ page, api }) => {
    await home(page);
    await acct(page).click();
    await page.locator('.login .swap').click();
    await expect(page.locator('.login .submit')).toHaveText('Sign up');
    await expect(page.locator('#login-title')).toHaveText('Sign up');
    await expect(page.locator('.login .switch')).toHaveText('Have an account? Log in');
    await expect(page.locator('#h-name')).toHaveText('3–20 letters, digits, _ -');
    await expect(page.locator('#h-pass')).toHaveText('8 or more characters');
    await expect(field(page, 'pass')).toHaveAttribute('autocomplete', 'new-password');
    const fill = async (invite, name, password) => {
      await field(page, 'invite').fill(invite);
      await field(page, 'name').fill(name);
      await field(page, 'pass').fill(password);
      await field(page, 'pass').press('Enter');
    };
    // Checked here before it is sent: the name, then the password.
    await fill('TEST-INVITE', 'al', 'password1');
    await expect(error(page)).toHaveText('A name is 3–20 letters, digits, _ or -');
    await expect(field(page, 'name')).toBeFocused();
    await expect(field(page, 'pass')).toHaveValue('password1');
    await fill('TEST-INVITE', 'alex', 'short');
    await expect(error(page)).toHaveText('A password is 8 or more characters');
    await expect(field(page, 'pass')).toBeFocused();
    expect(api.requests.filter(r => r.path === '/api/signup')).toHaveLength(0);
    // The API's errors.
    await fill('OLD-CODE', 'alex', 'password1');
    await expect(error(page)).toHaveText("That invite code isn't valid or has been used");
    await expect(field(page, 'invite')).toBeFocused();
    await expect(field(page, 'invite')).toHaveValue('OLD-CODE');
    await expect(field(page, 'name')).toHaveValue('alex');
    await expect(field(page, 'pass')).toHaveValue('');
    await fill('TEST-INVITE', 'Sam', 'password1');
    await expect(error(page)).toHaveText('That name is taken');
    await expect(field(page, 'name')).toBeFocused();
    api.answer['/api/signup'] = () => ({ status: 400, body: { error: 'name' } });
    await fill('TEST-INVITE', 'alex', 'password1');
    await expect(error(page)).toHaveText('A name is 3–20 letters, digits, _ or -');
    api.answer['/api/signup'] = () => ({ status: 429, body: { error: 'rate' } });
    await fill('TEST-INVITE', 'alex', 'password1');
    await expect(error(page)).toHaveText('Too many tries: wait a minute');
    await expect(page.locator('.login .submit')).toBeFocused();
    api.answer['/api/signup'] = () => 'down';
    await fill('TEST-INVITE', 'alex', 'password1');
    await expect(error(page)).toHaveText("Can't reach the server: try again");
    await expect(page.locator('.login .submit')).toBeFocused();
    await expect(field(page, 'pass')).toHaveValue('password1');
    delete api.answer['/api/signup'];
    // Switching mode clears the error and the password.
    await page.locator('.login .swap').click();
    await expect(error(page)).toBeHidden();
    await expect(field(page, 'invite')).toBeHidden();
    await page.locator('.login .swap').click();
    await fill('test-invite', 'Alex_2', 'password1');
    await atSelect(page);
    await expect(acct(page)).toHaveText('Alex_2');
    expect(api.requests.filter(r => r.path === '/api/signup').at(-1).body).toEqual({ invite: 'test-invite', name: 'Alex_2', password: 'password1' });
  });

  test('log in errors: too many tries, and the server out of reach', async ({ page, api }) => {
    await home(page);
    await acct(page).click();
    api.answer['/api/login'] = () => ({ status: 429, body: { error: 'rate' } });
    await logIn(page);
    await expect(error(page)).toHaveText('Too many tries: wait a minute');
    await expect(page.locator('.login .submit')).toBeFocused();
    delete api.answer['/api/login'];
    api.down = true;
    await page.locator('.login .submit').click();
    await expect(error(page)).toHaveText("Can't reach the server: try again");
    await expect(page.locator('.login .submit')).toBeFocused();
    await expect(field(page, 'name')).toHaveValue('sam');
    api.down = false;
    await page.keyboard.press('Enter');
    await atSelect(page);
    await expect(acct(page)).toHaveText('sam');
  });

  test('runs played before logging in go up once, to the account that logs in', async ({ page, api }) => {
    await page.goto('/');
    await loaded(page);
    await levelRow(page, 1).click();
    await finishRun(page);
    const [run] = await kept(page);
    await page.locator('.finish .levels').click();
    expect(posts(api)).toHaveLength(0);                          // signed out: nothing goes up
    await acct(page).click();
    await logIn(page);
    await expect.poll(() => posts(api, run.id).length).toBe(1);
    await expect.poll(() => outbox(page)).toEqual([]);
    expect(posts(api, run.id)[0].body).toEqual(run);
    expect(posts(api, run.id)[0].headers['content-type']).toBe('application/json');
    // Out, in again, a reload: never a second time.
    await acct(page).click();
    await acct(page).click();
    await expect(acct(page)).toHaveText('Log in');
    await acct(page).click();
    await logIn(page);
    await page.reload();
    await loaded(page);
    await page.evaluate(() => window.mathtime.account.settled());
    expect(posts(api, run.id)).toHaveLength(1);
    expect(await kept(page)).toHaveLength(1);                     // the run stays in the browser
  });
});

test('signed in, every row plays and the link shows the name; tapped, "Log out" for 4s', async ({ page, api }) => {
  await page.clock.install();
  await home(page);
  await expect(page.locator('.select .row.locked')).toHaveCount(0);
  await expect(acct(page)).toHaveText('sam');
  await acct(page).click();
  await expect(acct(page)).toHaveText('Log out');
  await expect(acct(page)).not.toHaveAttribute('aria-label');
  await page.clock.runFor(3900);
  await expect(acct(page)).toHaveText('Log out');
  await page.clock.runFor(200);
  await expect(acct(page)).toHaveText('sam');
  // Until the focus leaves.
  await acct(page).click();
  await expect(acct(page)).toHaveText('Log out');
  await page.keyboard.press('Shift+Tab');
  await expect(acct(page)).toHaveText('sam');
  // Logging out: the locks come back, the runs stay.
  await acct(page).click();
  await acct(page).click();
  await expect(acct(page)).toHaveText('Log in');
  await expect(page.locator('.select .row.locked')).toHaveCount(3);
  await expect(page.locator('#status')).toHaveText('Logged out');
  await expect.poll(() => api.requests.filter(r => r.path === '/api/logout' && r.method === 'POST').length).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.account')))).toBeNull();
});

test.describe('the cached sign-in', () => {
  test.use({ account: null });

  test('shows at once, with no flash of locks, until /api/me answers; 401 then signs out', async ({ page, context }) => {
    await context.addInitScript(() => localStorage.setItem('mathtime.account', JSON.stringify({ name: 'sam' })));
    let release;
    const held = new Promise(r => { release = r; });
    await page.route('**/api/me', async route => {
      await held;
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"auth"}' });
    });
    // From the first frame the selector shows, nothing is locked.
    await page.addInitScript(() => {
      window.seen = [];
      const look = () => {
        if (!document.documentElement.classList.contains('loading') && document.querySelector('.select .row')) {
          window.seen.push([document.querySelectorAll('.select .row.locked').length, document.querySelector('.acct').textContent]);
        }
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    await home(page);
    await settle(page);
    expect(await page.evaluate(() => window.seen.every(([locks, link]) => locks === 0 && link === 'sam'))).toBe(true);
    expect(await page.evaluate(() => window.seen.length)).toBeGreaterThan(0);
    release();
    await expect(page.locator('.select .row.locked')).toHaveCount(3);
    await expect(acct(page)).toHaveText('Log in');
  });

  test('the server out of reach keeps the cached state', async ({ page, context, api }) => {
    await context.addInitScript(() => localStorage.setItem('mathtime.account', JSON.stringify({ name: 'sam' })));
    api.down = true;
    await home(page);
    await expect.poll(() => api.requests.some(r => r.path === '/api/me')).toBe(true);
    await settle(page);
    await expect(acct(page)).toHaveText('sam');
    await expect(page.locator('.select .row.locked')).toHaveCount(0);
  });

  test('cached signed out, /api/me signs in: the locks go', async ({ page, api }) => {
    api.session = 'sam';
    await home(page);
    await expect(acct(page)).toHaveText('sam');
    await expect(page.locator('.select .row.locked')).toHaveCount(0);
  });
});

test.describe('the upload', () => {
  test('a finished run goes up at once and leaves the queue', async ({ page, api }) => {
    await home(page);
    await levelRow(page, 1).click();
    await finishRun(page);
    const [run] = await kept(page);
    await expect.poll(() => posts(api, run.id).length).toBe(1);
    await expect.poll(() => outbox(page)).toEqual([]);
    expect(api.runs('sam').get(run.id)).toMatchObject({ id: run.id, level: 1, totalMs: run.totalMs });
  });

  test('a failed upload stays queued and is sent again on the next load', async ({ page, api }) => {
    api.answer['/api/runs'] = () => 'down';
    await home(page);
    await levelRow(page, 1).click();
    await finishRun(page);
    const [run] = await kept(page);
    await expect.poll(() => posts(api, run.id).length).toBe(1);
    expect(await outbox(page)).toEqual([run.id]);
    api.answer['/api/runs'] = () => ({ status: 500, body: { error: 'oops' } });
    await page.reload();
    await loaded(page);
    await expect.poll(() => posts(api, run.id).length).toBe(2);
    expect(await outbox(page)).toEqual([run.id]);
    delete api.answer['/api/runs'];
    await page.reload();
    await loaded(page);
    await expect.poll(() => outbox(page)).toEqual([]);
    expect(posts(api, run.id)).toHaveLength(3);
    expect(api.runs('sam').has(run.id)).toBe(true);
  });

  test('and on the next finish', async ({ page, api }) => {
    api.answer['/api/runs'] = () => 'down';
    await home(page);
    await levelRow(page, 1).click();
    await finishRun(page);
    const [first] = await kept(page);
    await expect.poll(() => posts(api, first.id).length).toBe(1);
    delete api.answer['/api/runs'];
    await page.locator('.finish .again').click();
    await finishRun(page);
    await expect.poll(() => outbox(page)).toEqual([]);
    expect(api.runs('sam').size).toBe(2);
  });

  test('a run the API already has (200) leaves the queue too', async ({ page, context, api }) => {
    const run = earlier('dup', 1, 61000);
    await keptBefore(page, [run]);
    await context.addInitScript(r => {
      if (localStorage.getItem('mathtime.outbox') === null) {
        localStorage.setItem('mathtime.outbox', JSON.stringify([{ id: r.id, name: 'sam' }]));
      }
    }, run);
    api.runs('sam').set(run.id, run);
    await home(page);
    await expect.poll(() => outbox(page)).toEqual([]);
    expect(posts(api, 'dup')).toHaveLength(1);
    expect(api.runs('sam').size).toBe(1);
  });

  test("the finish screen's best is the account's, merged with the runs still queued", async ({ page, context, api }) => {
    // From another device: 0:01.5 on Addition 1.
    api.runs('sam').set('elsewhere', earlier('elsewhere', 1, 1500));
    await home(page);
    await expect(levelRow(page, 1).locator('.best')).toHaveText(formatTime(1500));
    // Cached for offline use.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.best')))).toEqual({ name: 'sam', best: { 1: 1500 } });
    // Offline now; a faster run waits in the queue (1ms: faster than any
    // run played here, so the finish screen shows it as the best).
    api.down = true;
    const queued = earlier('queued', 1, 1);
    await page.evaluate(r => {
      localStorage.setItem('mathtime.runs', JSON.stringify([r]));
      localStorage.setItem('mathtime.outbox', JSON.stringify([{ id: r.id, name: 'sam' }]));
    }, queued);
    await page.reload();
    await loaded(page);
    await expect(levelRow(page, 1).locator('.best')).toHaveText(formatTime(1));
    expect(await page.evaluate(() => window.mathtime.account.best(1))).toBe(1);
    await levelRow(page, 1).click();
    await finishRun(page);
    await expect(page.locator('.finish .done-best')).toHaveText(`Best ${formatTime(1)}`);
  });

  test("signed out, the bests are this browser's runs, as before", async ({ page, api }) => {
    api.session = null;
    await page.addInitScript(() => {
      if (localStorage.getItem('mathtime.account') !== 'null') localStorage.setItem('mathtime.account', 'null');
    });
    await keptBefore(page, [earlier('here', 1, 72400)]);
    await home(page);
    await expect(levelRow(page, 1).locator('.best')).toHaveText('1:12.4');
    await levelRow(page, 1).click();
    await finishRun(page);
    expect(posts(api)).toHaveLength(0);
    // Both wait, as no one's, for the account that logs in here next.
    const [, run] = await kept(page);
    expect(await entries(page)).toEqual([{ id: 'here', name: null }, { id: run.id, name: null }]);
  });
});

// No screen of the accounts scrolls or overflows at any size we check
// (the implementer rules): the selector signed out and in, and the log-in
// screen in each mode, with an error. Real scrollbars (the desktop
// project's browser).
test.describe('fits', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'its own windows, from the desktop browser'));
  const SIZES = [[375, 812, 2], [320, 640, 2], [844, 390, 3], [1366, 657, 1], [1440, 900, 1], [1920, 1080, 1], [1536, 730, 1.25], [1280, 610, 1.5]];
  for (const [width, height, dpr] of SIZES) {
    test(`at ${width}×${height}@${dpr}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, baseURL });
      try {
        const api = fakeApi();
        await api.attach(context);
        const page = await context.newPage();
        const overflow = () => page.evaluate(() => {
          const found = [];
          const doc = document.scrollingElement;
          if (doc.scrollHeight > doc.clientHeight || doc.scrollWidth > doc.clientWidth) found.push('the document');
          for (const el of document.querySelectorAll('body *')) {
            if (!el.getClientRects().length || el.closest('.sr-only')) continue;
            const cs = getComputedStyle(el);
            const name = el.id || el.className?.baseVal || el.className || el.tagName;
            if (el.scrollHeight > el.clientHeight + 0.5 && /auto|scroll/.test(cs.overflowY)) found.push(`${name} scrolls`);
            const r = el.getBoundingClientRect();
            if (r.right > innerWidth + 0.01 || r.left < -0.01) found.push(`${name} is past the side`);
          }
          return found;
        });
        await page.goto('/');
        await loaded(page);
        await expect(acct(page)).toHaveText('Log in');
        const select = await overflow();
        // The selector scrolls on a phone and a phone held sideways, as designed
        // (the topic-columns mockup); nothing else does.
        expect(select.filter(f => !(/^select (cols )?scrolls$/.test(f) && (width < 600 || height < 450)))).toEqual([]);
        await acct(page).click();
        expect(await overflow(), 'Log in').toEqual([]);
        await logIn(page, 'sam', 'nope-nope');
        await expect(error(page)).toBeVisible();
        expect(await overflow(), 'Log in, an error').toEqual([]);
        await page.locator('.login .swap').click();
        expect(await overflow(), 'Sign up').toEqual([]);
        await field(page, 'invite').fill('OLD-CODE');
        await field(page, 'name').fill('alex');
        await field(page, 'pass').fill('password1');
        await page.keyboard.press('Enter');
        await expect(error(page)).toHaveText("That invite code isn't valid or has been used");
        expect(await overflow(), 'Sign up, an error').toEqual([]);
        await page.keyboard.press('Escape');
        await logInFromLink(page);
        await expect(acct(page)).toHaveText('sam');
        const signedIn = await overflow();
        expect(signedIn.filter(f => !(/^select (cols )?scrolls$/.test(f) && (width < 600 || height < 450)))).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});

async function logInFromLink(page) {
  await acct(page).click();
  await logIn(page);
  await atSelect(page);
}

// ---------- The code review's and the UI review's fixes ----------

test.describe('two accounts, one device', () => {
  test.use({ account: null });

  test("a run waits for the account it was played in, and never goes to another", async ({ page, api }) => {
    api.users.set('alex', { name: 'alex', password: 'password1' });
    await home(page);
    await acct(page).click();
    await logIn(page);
    await atSelect(page);
    api.answer['/api/runs'] = () => 'down';               // sam's run can't go up
    await levelRow(page, 1).click();
    await finishRun(page);
    const [sams] = await kept(page);
    await expect.poll(() => posts(api, sams.id).length).toBe(1);
    await page.locator('.finish .levels').click();
    await acct(page).click();
    await acct(page).click();                              // sam logs out
    await expect(acct(page)).toHaveText('Log in');
    delete api.answer['/api/runs'];
    await acct(page).click();
    await logIn(page, 'alex');
    await atSelect(page);
    await expect(acct(page)).toHaveText('alex');
    await page.evaluate(() => window.mathtime.account.settled());
    expect(api.runs('alex').size).toBe(0);
    expect(posts(api, sams.id)).toHaveLength(1);
    expect(await entries(page)).toEqual([{ id: sams.id, name: 'sam' }]);
    await expect(levelRow(page, 1)).not.toHaveClass(/\bfinished\b/);   // not alex's best
    // Back to sam: it goes up to sam.
    await acct(page).click();
    await acct(page).click();
    await acct(page).click();
    await logIn(page);
    await expect.poll(() => api.runs('sam').has(sams.id)).toBe(true);
    await expect.poll(() => outbox(page)).toEqual([]);
    expect(api.runs('alex').size).toBe(0);
    await expect(levelRow(page, 1)).toHaveClass(/\bfinished\b/);
  });

  test('a log in answered after the screen was left and opened again starts nothing', async ({ page, api }) => {
    let release, hit = false;
    const held = new Promise(r => { release = r; });
    await page.route('**/api/login', async route => {
      hit = true;
      await held;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"name":"sam"}' });
    });
    await home(page);
    await levelRow(page, 6).click();
    await logIn(page);
    await expect.poll(() => hit).toBe(true);
    await page.keyboard.press('Escape');
    await levelRow(page, 7).click();                      // a new visit
    await atLogin(page);
    release();
    await expect(acct(page)).toHaveText('sam');           // the answer still signs in
    await atLogin(page);                                  // but starts nothing
    expect(await page.evaluate(() => document.body.classList.contains('at-login'))).toBe(true);
    await expect(field(page, 'name')).toBeFocused();
  });
});

test('a log out the server never heard sticks: signed out on the next load, sent again until it goes', async ({ page, api }) => {
  await home(page);
  api.answer['/api/logout'] = () => 'down';
  await acct(page).click();
  await acct(page).click();
  await expect(acct(page)).toHaveText('Log in');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.logoutPending')))).toBe(true);
  // The session is still alive on the server, but the next load stays out.
  const before = api.requests.length;
  await page.reload();
  await loaded(page);
  await expect.poll(() => api.requests.slice(before).some(r => r.path === '/api/logout')).toBe(true);
  await settle(page);
  await expect(acct(page)).toHaveText('Log in');
  await expect(page.locator('.select .row.locked')).toHaveCount(3);
  expect(api.requests.slice(before).some(r => r.path === '/api/me')).toBe(false);
  // Once it goes through, /api/me is asked, and says no one.
  delete api.answer['/api/logout'];
  const again = api.requests.length;
  await page.reload();
  await loaded(page);
  await expect.poll(() => api.requests.slice(again).map(r => r.path)).toEqual(['/api/logout', '/api/me']);
  expect(api.session).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('mathtime.logoutPending'))).toBeNull();
  await expect(acct(page)).toHaveText('Log in');
});

test.describe('the log-in screen', () => {
  test.use({ account: null });

  test('the breadcrumb names the mode: "Levels › Log in", "Levels › Sign up"', async ({ page }) => {
    await home(page);
    await acct(page).click();
    await expect(page.locator('.crumbs .here')).toHaveText('Log in');
    await expect(page.locator('#login-title')).toHaveText('Log in');
    await page.locator('.login .swap').click();
    await expect(page.locator('.crumbs .here')).toHaveText('Sign up');
    await expect(page.locator('#login-title')).toHaveText('Sign up');
    await expect(page.locator('.crumbs .here')).toBeVisible();
    await page.locator('.login .swap').click();
    await expect(page.locator('.crumbs .here')).toHaveText('Log in');
    await expect(page.locator('#login-title')).toHaveText('Log in');
    // Opened again in sign-up mode's wake: Log in.
    await page.locator('.login .swap').click();
    await page.keyboard.press('Escape');
    await acct(page).click();
    await expect(page.locator('.crumbs .here')).toHaveText('Log in');
  });

  test('the error goes on the next edit of any field', async ({ page }) => {
    await home(page);
    await acct(page).click();
    await logIn(page, 'sam', 'wrong-one');
    await expect(error(page)).toHaveText("That name and password don't match");
    await page.keyboard.type('x');                        // in the password, focused
    await expect(error(page)).toBeHidden();
    await page.locator('.login .submit').click();
    await expect(error(page)).toHaveText("That name and password don't match");
    await field(page, 'name').press('End');
    await field(page, 'name').press('Backspace');         // the name, edited
    await expect(error(page)).toBeHidden();
    await page.locator('.login .swap').click();
    await field(page, 'invite').fill('OLD');
    await field(page, 'name').fill('alex');
    await field(page, 'pass').fill('password1');
    await page.keyboard.press('Enter');
    await expect(error(page)).toHaveText("That invite code isn't valid or has been used");
    await field(page, 'invite').type('X');                 // the invite code, edited
    await expect(error(page)).toBeHidden();
  });
});

// Where the list has a scrollbar that takes room (the desktop project's
// real ones), its tiles end short of the header's edge, and the header
// link's ink ends with them (the UI review). Reached as the reviewer did:
// back from a level low in the list, so the list is scrolled to it.
test.describe('the header link beside a scrollbar', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'real scrollbars'));
  for (const [width, height] of [[375, 812], [320, 640], [844, 390]]) {
    for (const signedIn of [true, false]) {
      test(`at ${width}×${height}, ${signedIn ? 'signed in' : 'signed out'}, its ink ends on the tiles' right edge`, async ({ page, api }) => {
        if (!signedIn) {
          api.session = null;
          await page.addInitScript(() => localStorage.setItem('mathtime.account', 'null'));
        }
        await page.setViewportSize({ width, height });
        await home(page);
        // Division, the last topic: back from playing it, or signed out,
        // from its lock's log-in screen.
        await levelRow(page, 5).click();
        await page.keyboard.press('Escape');
        await atSelect(page);
        await settle(page);
        const m = await page.evaluate(() => {
          const list = document.querySelector('.select');
          return {
            bar: list.offsetWidth - list.clientWidth,
            scrolled: list.scrollTop,
            tiles: Math.max(...[...list.querySelectorAll('.row')].map(r => r.getBoundingClientRect().right)),
            box: (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(document.querySelector('.acct').getBoundingClientRect()),
          };
        });
        expect(m.bar, 'the list has a scrollbar that takes room').toBeGreaterThan(0);
        expect(m.scrolled, 'scrolled to the level').toBeGreaterThan(0);
        await page.addStyleTag({ content: 'body{background:#12407e!important}' });
        const shot = await capture(page);
        const found = ink(shot, { left: m.box.left - 20, right: width, top: m.box.top, bottom: m.box.bottom }, MUTED);
        expect(Math.abs(found.right - m.tiles), `ink ends at ${found.right}, tiles at ${m.tiles}`).toBeLessThanOrEqual(0.6);
      });
    }
  }

  test('with no scrollbar, its ink still ends at the header edge', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await home(page);
    await page.addStyleTag({ content: 'body{background:#12407e!important}' });
    const box = await page.locator('.acct').boundingBox();
    const edge = await page.evaluate(() => {
      const top = document.querySelector('.top');
      return top.getBoundingClientRect().right - parseFloat(getComputedStyle(top).paddingRight);
    });
    const found = ink(await capture(page), { left: box.x - 20, right: 1440, top: box.y, bottom: box.y + box.height }, MUTED);
    expect(Math.abs(found.right - edge)).toBeLessThanOrEqual(0.6);
  });
});

// Back from a level, the list scrolls to its row, and the row's focus ring
// (2px, 4px out) shows whole, with room past it: never flush with the
// list's edge, where it read as cut off (the UI review, 844×390).
test.describe('the focus ring, back from a level', () => {
  test.beforeEach(() => test.skip(test.info().project.name !== 'desktop', 'its own windows, from the desktop browser'));
  const SIZES = [[375, 812, 2], [320, 640, 2], [844, 390, 3], [1366, 657, 1], [1440, 900, 1], [1920, 1080, 1], [1536, 730, 1.25], [1280, 610, 1.5]];
  for (const [width, height, dpr] of SIZES) {
    for (const signedIn of [true, false]) {
      test(`at ${width}×${height}@${dpr}, ${signedIn ? 'signed in' : 'signed out'}, it is inside the list's visible area`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, baseURL });
        try {
          await withAccount(context, signedIn ? 'sam' : null);
          const page = await context.newPage();
          if (!signedIn) await page.addInitScript(() => localStorage.setItem('mathtime.account', 'null'));
          await home(page);
          await levelRow(page, 5).click();                    // Division: the last topic
          await page.keyboard.press('Escape');
          await expect(levelRow(page, 5)).toBeFocused();
          await settle(page);
          const m = await page.evaluate(() => {
            const list = document.querySelector('.select'), box = list.getBoundingClientRect();
            const r = list.querySelector('.row[data-level="5"]').getBoundingClientRect();
            const top = box.top + list.clientTop, left = box.left + list.clientLeft;
            return {
              ring: { top: r.top - 6, bottom: r.bottom + 6, left: r.left - 6, right: r.right + 6 },
              view: { top, bottom: top + list.clientHeight, left, right: left + list.clientWidth },
              scrollTop: list.scrollTop,
            };
          });
          expect(m.ring.top, 'ring top').toBeGreaterThanOrEqual(m.view.top - 0.01);
          expect(m.ring.bottom, 'ring bottom').toBeLessThanOrEqual(m.view.bottom + 0.01);
          expect(m.ring.left, 'ring left').toBeGreaterThanOrEqual(m.view.left - 0.01);
          expect(m.ring.right, 'ring right').toBeLessThanOrEqual(m.view.right + 0.01);
          if (m.scrollTop > 0) expect(m.view.bottom - m.ring.bottom, '6px past the ring').toBeGreaterThanOrEqual(6 - 0.01);
        } finally {
          await context.close();
        }
      });
    }
  }
});

// The name's rule, in the error and the hint, keeps "_ or -" on one line
// (no-break spaces): at 320×640 it wrapped as "…digits, _" / "or -".
test.describe('at 320×640', () => {
  test.use({ account: null });
  test('"_ or -" is never split across lines, in the error or the hint', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await home(page);
    await acct(page).click();
    await page.locator('.login .swap').click();
    await field(page, 'invite').fill('TEST-INVITE');
    await field(page, 'name').fill('al');
    await field(page, 'pass').fill('password1');
    await page.keyboard.press('Enter');
    await expect(error(page)).toHaveText('A name is 3–20 letters, digits, _ or -');
    const lines = await page.evaluate(() => [document.querySelector('.login .error'), document.querySelector('#h-name')].map(node => {
      const text = node.firstChild, at = text.data.lastIndexOf('_');
      const range = document.createRange();
      range.setStart(text, at);
      range.setEnd(text, text.data.length);
      return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
    }));
    expect(lines, 'one line each').toEqual([1, 1]);
  });
});
