import { test, expect } from './fixtures.js';

// Google sign-in on the client (2026-11-23-open-signup-design.md §2): the
// "Continue with Google" button, shown only when /api/config says so; Pick
// a name, after Google for a new account; and the callback's ?auth=, read
// on load and taken off the URL. The API is the fake in fixtures.js:
// `api.google` is what /api/config says, and `api.pending` a Google
// sign-up waiting for its name.

test.use({ account: null });

const loaded = page => page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
const google = page => page.locator('.login .google');
const field = (page, name) => page.locator(`#f-${name}`);
const error = page => page.locator('.login .error');
const at = (page, screen) => expect(page.locator('body')).toHaveClass(new RegExp(`\\bat-${screen}\\b`));
const path = page => new URL(page.url()).pathname + new URL(page.url()).search;
const who = page => page.evaluate(() => window.mathtime.account.name);
async function toLogIn(page) {
  await page.goto('/');
  await loaded(page);
  await page.locator('.home .gear').click();
  await page.locator('.settings .login').click();
  await at(page, 'login');
}

test('with Google off, there is no Google button on Log in or Sign up', async ({ page, api }) => {
  api.google = false;
  await toLogIn(page);
  await expect(google(page)).toBeHidden();
  await expect(page.locator('.login .or')).toBeHidden();
  await page.locator('.login .swap').click();
  await expect(google(page)).toBeHidden();
});

test('with Google on, both have it, a link to /api/google/start', async ({ page, api }) => {
  api.google = true;
  let started = false;
  await page.route('**/api/google/start', route => {
    started = true;
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google</p>' });
  });
  await toLogIn(page);
  await expect(google(page)).toBeVisible();
  await expect(google(page)).toHaveText('Continue with Google');
  await expect(google(page)).toHaveAttribute('href', '/api/google/start');
  await expect(page.locator('.login .or')).toBeVisible();
  await page.locator('.login .swap').click();
  await expect(google(page)).toBeVisible();
  // A code makes it a password account: no Google till "No code".
  await page.locator('.login .have-code button').click();
  await expect(google(page)).toBeHidden();
  await page.locator('.login .no-code button').click();
  await expect(google(page)).toBeVisible();
  await google(page).click();
  await page.waitForURL('**/api/google/start');
  expect(started).toBe(true);
});

test('/api/config asked once; if it fails, no button', async ({ page, api }) => {
  api.answer['/api/config'] = () => 'down';
  await toLogIn(page);
  await page.locator('.login .swap').click();
  await expect(google(page)).toBeHidden();
  expect(api.requests.filter(r => r.path === '/api/config')).toHaveLength(1);
});

test('?auth=name opens Pick a name; a name, and Home signed in', async ({ page, api }) => {
  api.google = true;
  api.pending = 'sub-1';
  await page.goto('/?auth=name');
  await loaded(page);
  await at(page, 'login');
  expect(path(page)).toBe('/');
  await expect(page.locator('#login-title')).toHaveText('Pick a name');
  await expect(page.locator('.crumbs .back')).toHaveText('Home');
  await expect(page.locator('.crumbs .here')).toHaveText('Pick a name');
  await expect(page.locator('.login .lede')).toBeVisible();
  await expect(page.locator('.login .submit')).toHaveText('Continue');
  await expect(field(page, 'name')).toBeFocused();
  await expect(page.locator('#h-name')).toBeVisible();
  for (const hidden of ['#f-pass', '#f-invite', '.login .have-code', '.login .switch', '.login .google', '.login .or']) {
    await expect(page.locator(hidden), hidden).toBeHidden();
  }
  await field(page, 'name').fill('gina');
  await page.keyboard.press('Enter');
  await at(page, 'home');
  expect(await who(page)).toBe('gina');
  await expect(page.locator('#status')).toHaveText('Signed in as gina');
  expect(api.requests.filter(r => r.path === '/api/google/name').map(r => r.body)).toEqual([{ name: 'gina' }]);
  // Pick a name is gone: Settings' sign-up is a sign-up again.
  await page.locator('.home .gear').click();
  await expect(page.locator('.settings .who')).toHaveText('Logged in as gina');
});

test('Pick a name: a name checked first, then taken, then expired', async ({ page, api }) => {
  api.google = true;
  api.pending = 'sub-1';
  await page.goto('/?auth=name');
  await loaded(page);
  await field(page, 'name').fill('al');
  await page.keyboard.press('Enter');
  await expect(error(page)).toHaveText('A name is 3–20 letters, digits, _ or -');
  expect(api.requests.filter(r => r.path === '/api/google/name')).toHaveLength(0);
  await field(page, 'name').fill('Sam');
  await page.keyboard.press('Enter');
  await expect(error(page)).toHaveText('That name is taken');
  await expect(field(page, 'name')).toBeFocused();
  await expect(field(page, 'name')).toHaveValue('Sam');
  api.pending = null;
  await field(page, 'name').fill('gina');
  await page.keyboard.press('Enter');
  await expectExpired(page);
  expect(await who(page)).toBeNull();
});

// Pick a name's sign-up gone (the UI review): Continue with Google is the
// one thing left to do, its error under it, the line above saying why.
async function expectExpired(page) {
  await expect(google(page)).toBeVisible();
  await expect(google(page)).toHaveText('Continue with Google');
  await expect(google(page)).toBeFocused();
  // Named for what happened, in the title and the breadcrumb; the line
  // under the title says it once, with no red error repeating it.
  await expect(page.locator('#login-title')).toHaveText('Timed out');
  await expect(page.locator('.crumbs .back')).toHaveText('Home');
  await expect(page.locator('.crumbs .here')).toHaveText('Timed out');
  const title = await page.locator('#login-title').evaluate(n => {
    const range = document.createRange();
    range.selectNodeContents(n);
    return { lines: new Set([...range.getClientRects()].map(r => Math.round(r.top))).size, right: n.getBoundingClientRect().left + range.getBoundingClientRect().width, column: document.querySelector('.login .google').getBoundingClientRect().right };
  });
  expect(title.lines, 'the title on one line').toBe(1);
  expect(title.right, 'inside the column').toBeLessThanOrEqual(title.column);
  await expect(page.locator('.login .lede')).toHaveText('Start again with Google.');
  for (const gone of ['#f-name', '#h-name', '.login .submit', '.login .or', '.login .error', '.login .g-error']) {
    await expect(page.locator(gone), gone).toBeHidden();
  }
  // Its focus ring the weight of a field's, inside it: no ring outside.
  const ring = await google(page).evaluate(n => ({ fv: n.matches(':focus-visible'), outline: getComputedStyle(n).outlineStyle, shadow: getComputedStyle(n).boxShadow }));
  expect(ring.outline).toBe('none');
  expect(ring.shadow).toMatch(/2px inset|inset .*2px/);
}

test('Pick a name: a 404 from the API is the sign-up expired too', async ({ page, api }) => {
  api.google = true;
  api.pending = 'sub-1';
  api.answer['/api/google/name'] = () => ({ status: 404, body: { error: 'not found' } });
  await page.goto('/?auth=name');
  await loaded(page);
  await field(page, 'name').fill('gina');
  await page.keyboard.press('Enter');
  await expectExpired(page);
});

test('?auth=in clears a log out still pending, so the new session stays', async ({ page, api, context }) => {
  api.session = 'sam';
  await context.addInitScript(() => localStorage.setItem('mathtime.logoutPending', 'true'));
  await page.goto('/?auth=in');
  await loaded(page);
  await expect.poll(() => who(page)).toBe('sam');
  expect(api.requests.some(r => r.path === '/api/logout')).toBe(false);
  expect(api.session).toBe('sam');
  expect(await page.evaluate(() => localStorage.getItem('mathtime.logoutPending'))).toBeNull();
});

test('Home after Pick a name: the daily card\'s focus ring stays inside the column', async ({ page, api }) => {
  api.google = true;
  api.pending = 'sub-1';
  await page.goto('/?auth=name');
  await loaded(page);
  await field(page, 'name').fill('gina');
  await page.keyboard.press('Enter');
  await at(page, 'home');
  const hero = page.locator('.home .hero');
  await expect(hero).toBeFocused();
  const m = await hero.evaluate(n => {
    const cs = getComputedStyle(n);
    return { fv: n.matches(':focus-visible'), offset: parseFloat(cs.outlineOffset), out: parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth) };
  });
  expect(m.fv).toBe(true);
  expect(m.out, 'the ring reaches no further than the card').toBeLessThanOrEqual(0);
  // and hugs its frame (2px), never crowding what is inside.
  expect(m.offset, 'just inside the frame').toBe(-4);
});

test('?auth=failed opens Log in with Google\'s error, under its button, nothing focused', async ({ page, api }) => {
  api.google = true;
  await page.goto('/?auth=failed');
  await loaded(page);
  await at(page, 'login');
  expect(path(page)).toBe('/');
  await expect(page.locator('#login-title')).toHaveText('Log in');
  await expect(page.locator('.login .g-error')).toHaveText("Google sign-in didn't work");
  await expect(error(page)).toBeHidden();
  const below = await page.evaluate(() => document.querySelector('.login .g-error').getBoundingClientRect().top - document.querySelector('.login .google').getBoundingClientRect().bottom);
  expect(below).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  // It goes on the next edit.
  await field(page, 'name').fill('s');
  await expect(page.locator('.login .g-error')).toBeHidden();
});

test('?auth=in loads /api/me and lands on Home signed in', async ({ page, api }) => {
  api.session = 'sam';
  await page.goto('/?auth=in#x');
  await loaded(page);
  await at(page, 'home');
  expect(path(page)).toBe('/');
  expect(new URL(page.url()).hash).toBe('#x');
  await expect.poll(() => who(page)).toBe('sam');
  await expect(page.locator('#status')).toHaveText('Signed in as sam');
  expect(api.requests.some(r => r.path === '/api/me')).toBe(true);
});
