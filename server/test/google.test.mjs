// Google sign-in (open sign-up spec §2): the pure parts in google.mjs, then the routes, with Google's
// token endpoint stubbed through createApp's fetch, so no test reaches Google.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startApi, cookieOf } from './helpers.mjs';
import { authUrl, pkce, checkIdToken, AUTH, TOKEN } from '../google.mjs';
import { verifyPassword } from '../auth.mjs';
import { PENDING_LIFE, createCode, findUser } from '../store.mjs';

const b64u = (s) => Buffer.from(s).toString('base64url');
// A JWT with any signature: only its claims are read.
const jwt = (claims) => `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify(claims))}.c2ln`;

describe('google.mjs', () => {
  test('authUrl asks for a code, openid only, PKCE S256 and the account picker', () => {
    const url = new URL(authUrl({ clientId: 'cid', redirectUri: 'https://m.test/api/google/callback', state: 'st', challenge: 'ch' }));
    assert.equal(`${url.origin}${url.pathname}`, AUTH);
    assert.equal(AUTH, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      client_id: 'cid', redirect_uri: 'https://m.test/api/google/callback', response_type: 'code', scope: 'openid',
      state: 'st', code_challenge: 'ch', code_challenge_method: 'S256', prompt: 'select_account',
    });
  });

  test('pkce gives a 43-128 character verifier and its S256 challenge, new each time', () => {
    const { verifier, challenge } = pkce();
    assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
    assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
    assert.notEqual(pkce().verifier, verifier);
  });

  test('checkIdToken gives the sub for a good token from either issuer', () => {
    const now = 1_000_000;
    for (const iss of ['https://accounts.google.com', 'accounts.google.com']) {
      assert.equal(checkIdToken(jwt({ iss, aud: 'cid', exp: now / 1000 + 60, sub: '123' }), { clientId: 'cid', now }), '123');
    }
  });

  test('checkIdToken throws for a wrong iss or aud, an expired token, no sub, or junk', () => {
    const now = 1_000_000;
    const good = { iss: 'https://accounts.google.com', aud: 'cid', exp: now / 1000 + 60, sub: '123' };
    for (const claims of [
      { ...good, iss: 'https://evil.test' },
      { ...good, aud: 'other' },
      { ...good, aud: ['cid'] },
      { ...good, exp: now / 1000 },
      { ...good, exp: undefined },
      { ...good, sub: '' },
      { ...good, sub: 123 },
    ]) {
      assert.throws(() => checkIdToken(jwt(claims), { clientId: 'cid', now }), JSON.stringify(claims));
    }
    for (const junk of ['', 'abc', 'a.b.c', 'a.bnVsbA.c', undefined, null]) {
      assert.throws(() => checkIdToken(junk, { clientId: 'cid', now }), String(junk));
    }
  });

  test("a Google account's password hash '!' never verifies, and doesn't throw", async () => {
    for (const password of ['', '!', 'password1']) assert.equal(await verifyPassword(password, '!'), false);
  });
});

const GOOGLE = { clientId: 'cid', clientSecret: 'sec', publicUrl: 'https://m.test' };

let api, stub, logs;

// Google's token endpoint, stubbed: answers with an ID token for `sub`, and remembers what it was sent.
function tokenStub() {
  const stub = {
    sub: 'g-1',
    claims: {},
    status: 200,
    calls: [],
    throws: false,
    reply: null,   // a Response to answer with instead
    async fetch(url, init) {
      stub.calls.push({ url: String(url), init, body: Object.fromEntries(new URLSearchParams(String(init.body))) });
      if (stub.throws) throw new TypeError('fetch failed');
      if (stub.reply) return stub.reply();
      const exp = Math.floor(api.clock.t / 1000) + 3600;
      const idToken = jwt({ iss: 'https://accounts.google.com', aud: 'cid', exp, sub: stub.sub, ...stub.claims });
      return new Response(JSON.stringify({ access_token: 'at-secret', id_token: idToken }),
        { status: stub.status, headers: { 'Content-Type': 'application/json' } });
    },
  };
  return stub;
}

beforeEach(async () => {
  stub = tokenStub();
  logs = [];
  api = await startApi({ google: GOOGLE, fetch: (...args) => stub.fetch(...args), log: (line) => logs.push(String(line)) });
});
afterEach(() => api.close());

// The Set-Cookie line for a cookie, and its "name=value" for sending back.
const sent = (res, name) => res.setCookie.find((c) => c.startsWith(`${name}=`));
const pair = (res, name) => sent(res, name)?.split(';')[0];

// Starts a sign-in; returns the state Google would send back and the mt_oauth cookie.
async function start() {
  const res = await api.call('GET', '/api/google/start');
  assert.equal(res.status, 302);
  const state = new URL(res.headers.get('location')).searchParams.get('state');
  return { res, state, cookie: pair(res, 'mt_oauth') };
}

// Starts a sign-in and comes back from Google with a code.
async function signIn() {
  const s = await start();
  return api.call('GET', `/api/google/callback?code=the-code&state=${s.state}`, { cookie: s.cookie });
}

const count = (table) => api.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const pickName = (name, cookie) => api.call('POST', '/api/google/name', { body: { name }, cookie });

// A new Google account picks a name; returns its session cookie.
async function newAccount(name, sub = 'g-1') {
  stub.sub = sub;
  const back = await signIn();
  assert.equal(back.headers.get('location'), '/?auth=name');
  const res = await pickName(name, pair(back, 'mt_pending'));
  assert.equal(res.status, 201);
  return cookieOf(res);
}

describe('GET /api/config', () => {
  test('{google: true} when Google sign-in is set up, false when not', async () => {
    assert.deepEqual((await api.call('GET', '/api/config')).json, { google: true });
    const off = await startApi();
    try {
      assert.deepEqual((await off.call('GET', '/api/config')).json, { google: false });
    } finally {
      await off.close();
    }
  });
});

describe('without Google set up', () => {
  test('the Google routes are 404', async () => {
    const off = await startApi();
    try {
      assert.equal((await off.call('GET', '/api/google/start')).status, 404);
      assert.equal((await off.call('GET', '/api/google/callback?code=c&state=s')).status, 404);
      assert.equal((await off.call('POST', '/api/google/name', { body: { name: 'gina' } })).status, 404);
    } finally {
      await off.close();
    }
  });
});

describe('GET /api/google/start', () => {
  test("302 to Google's consent screen, with the callback, state and a PKCE challenge", async () => {
    const { res, cookie } = await start();
    const location = res.headers.get('location');
    const url = new URL(location);
    assert.equal(`${url.origin}${url.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
    const q = url.searchParams;
    assert.equal(q.get('redirect_uri'), 'https://m.test/api/google/callback');
    assert.equal(q.get('client_id'), 'cid');
    assert.equal(q.get('scope'), 'openid');
    assert.equal(q.get('prompt'), 'select_account');
    assert.equal(q.get('code_challenge_method'), 'S256');
    const [state, verifier] = cookie.slice('mt_oauth='.length).split('.');
    assert.equal(q.get('state'), state);
    assert.equal(q.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
    assert.ok(!location.includes(verifier), 'the verifier stays in the cookie');
    assert.ok(!location.includes('sec'), 'and the secret on the server');
  });

  test('mt_oauth is HttpOnly, Secure, SameSite=Lax, Path=/api/google, for 10 minutes', async () => {
    const { res } = await start();
    assert.equal(res.setCookie.length, 1);
    assert.match(sent(res, 'mt_oauth'),
      /^mt_oauth=[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}; Max-Age=600; Path=\/api\/google; HttpOnly; Secure; SameSite=Lax$/);
  });

  test('a new state each time', async () => {
    assert.notEqual((await start()).state, (await start()).state);
  });

  test('COOKIE_INSECURE drops Secure from the Google cookies too', async () => {
    const insecure = await startApi({ cookieSecure: false, google: GOOGLE, fetch: stub.fetch, log: () => {} });
    try {
      const res = await insecure.call('GET', '/api/google/start');
      assert.match(sent(res, 'mt_oauth'), /; Max-Age=600; Path=\/api\/google; HttpOnly; SameSite=Lax$/);
    } finally {
      await insecure.close();
    }
  });
});

describe('GET /api/google/callback', () => {
  test('a new account: 302 to /?auth=name with mt_pending, and no session yet', async () => {
    const res = await signIn();
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/?auth=name');
    assert.match(sent(res, 'mt_pending'),
      /^mt_pending=[A-Za-z0-9_-]{43}; Max-Age=900; Path=\/api\/google; HttpOnly; Secure; SameSite=Lax$/);
    assert.match(sent(res, 'mt_oauth'), /^mt_oauth=; Max-Age=0; Path=\/api\/google; HttpOnly; Secure; SameSite=Lax$/);
    assert.equal(cookieOf(res), undefined);
    assert.equal(count('sessions'), 0);
    const token = pair(res, 'mt_pending').split('=')[1];
    const row = api.db.prepare('SELECT * FROM pending').get();
    assert.equal(row.token_hash, createHash('sha256').update(token).digest('hex'), 'kept only as its SHA-256');
    assert.equal(row.subject, 'g-1');
    assert.equal(row.provider, 'google');
    assert.equal(row.expires_at, api.clock.t + PENDING_LIFE);
  });

  test('swaps the code at the token endpoint with the secret and the verifier', async () => {
    const s = await start();
    await api.call('GET', `/api/google/callback?code=the-code&state=${s.state}`, { cookie: s.cookie });
    assert.equal(stub.calls.length, 1);
    const [call] = stub.calls;
    assert.equal(call.url, TOKEN);
    assert.equal(TOKEN, 'https://oauth2.googleapis.com/token');
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.ok(call.init.signal instanceof AbortSignal, 'with a timeout');
    assert.deepEqual(call.body, {
      code: 'the-code', client_id: 'cid', client_secret: 'sec', redirect_uri: 'https://m.test/api/google/callback',
      grant_type: 'authorization_code', code_verifier: s.cookie.split('.')[1],
    });
  });

  test('a known account: 302 to /?auth=in with a session, mt_oauth cleared', async () => {
    await newAccount('gina');
    const res = await signIn();
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/?auth=in');
    assert.match(sent(res, 'mt_oauth'), /^mt_oauth=; Max-Age=0;/);
    assert.equal(sent(res, 'mt_pending'), undefined);
    assert.match(sent(res, 'mt_session'),
      /^mt_session=[A-Za-z0-9_-]{43}; Max-Age=31536000; Path=\/api; HttpOnly; Secure; SameSite=Strict$/);
    assert.deepEqual((await api.call('GET', '/api/me', { cookie: cookieOf(res) })).json, { name: 'gina' });
  });

  test('anything wrong is a 302 to /?auth=failed, with no session or pending sign-up', async () => {
    const s = await start();
    const other = await start();
    const cases = {
      'a wrong state': [`code=c&state=${other.state}`, s.cookie],
      'no state': ['code=c', s.cookie],
      'no code': [`state=${s.state}`, s.cookie],
      'no cookie': [`code=c&state=${s.state}`, undefined],
      'a mangled cookie': [`code=c&state=${s.state}`, `mt_oauth=${s.state}`],
      'access_denied': [`error=access_denied&state=${s.state}`, s.cookie],
      'an error and a code': [`error=access_denied&code=c&state=${s.state}`, s.cookie],
    };
    for (const [what, [query, cookie]] of Object.entries(cases)) {
      const res = await api.call('GET', `/api/google/callback?${query}`, { cookie });
      assert.equal(res.status, 302, what);
      assert.equal(res.headers.get('location'), '/?auth=failed', what);
      assert.match(sent(res, 'mt_oauth'), /^mt_oauth=; Max-Age=0;/, `${what}: mt_oauth cleared`);
    }
    assert.equal(stub.calls.length, 0, 'Google is never asked');
    assert.equal(count('sessions') + count('pending'), 0);
  });

  test("a failure at Google's end, or a bad ID token, is a 302 to /?auth=failed", async () => {
    const secs = () => Math.floor(api.clock.t / 1000);
    const cases = {
      'the token endpoint answers 400': () => { stub.status = 400; },
      'the token endpoint is unreachable': () => { stub.throws = true; },
      'a wrong aud': () => { stub.claims = { aud: 'someone-else' }; },
      'a wrong iss': () => { stub.claims = { iss: 'https://evil.test' }; },
      'an expired token': () => { stub.claims = { exp: secs() - 1 }; },
      'no ID token': () => { stub.reply = () => new Response('{"access_token":"x"}', { status: 200 }); },
      'a reply that is not JSON': () => { stub.reply = () => new Response('<html>', { status: 200 }); },
    };
    for (const [what, arrange] of Object.entries(cases)) {
      Object.assign(stub, { status: 200, throws: false, claims: {}, reply: null });
      arrange();
      const res = await signIn();
      assert.equal(res.headers.get('location'), '/?auth=failed', what);
      assert.equal(cookieOf(res), undefined, what);
      assert.equal(sent(res, 'mt_pending'), undefined, what);
    }
    assert.equal(count('sessions') + count('pending'), 0);
  });

  test('never logs the code, the secret, the verifier or the tokens', async () => {
    const s = await start();
    stub.status = 400;
    await api.call('GET', `/api/google/callback?code=the-code&state=${s.state}`, { cookie: s.cookie });
    stub.status = 200;
    stub.claims = { aud: 'x' };
    await signIn();
    stub.throws = true;
    await signIn();
    stub.throws = false;
    stub.reply = () => new Response('{"id_token":"eyJ-not-a-jwt"}', { status: 200 });
    await signIn();
    assert.equal(logs.length, 4, 'each failure is logged');
    const text = logs.join('\n');
    for (const secret of ['the-code', 'sec', 'at-secret', s.state, s.cookie.split('.')[1], 'eyJ']) {
      assert.ok(!text.includes(secret), `the log has ${secret}: ${text}`);
    }
  });

  test('counted against the address', async () => {
    const s = await start();
    for (let i = 0; i < 10; i++) {
      await api.call('GET', '/api/google/callback?code=c&state=x', { cookie: s.cookie, ip: '192.0.2.5' });
    }
    const res = await api.call('GET', `/api/google/callback?code=c&state=${s.state}`, { cookie: s.cookie, ip: '192.0.2.5' });
    assert.equal(res.headers.get('location'), '/?auth=failed');
    assert.equal(stub.calls.length, 0);
  });
});

describe('POST /api/google/name', () => {
  test('201 {name} and a session; the account then signs in with Google, never with a password', async () => {
    const back = await signIn();
    const res = await pickName('gina', pair(back, 'mt_pending'));
    assert.equal(res.status, 201);
    assert.deepEqual(res.json, { name: 'gina' });
    assert.match(sent(res, 'mt_pending'), /^mt_pending=; Max-Age=0; Path=\/api\/google; HttpOnly; Secure; SameSite=Lax$/);
    assert.deepEqual((await api.call('GET', '/api/me', { cookie: cookieOf(res) })).json, { name: 'gina' });
    assert.equal(count('pending'), 0, 'the pending sign-up is used up');
    assert.equal(api.db.prepare('SELECT pw_hash FROM users').get().pw_hash, '!');
    for (const password of ['!', '', 'password1']) {
      const login = await api.call('POST', '/api/login', { body: { name: 'gina', password } });
      assert.equal(login.status, 401);
      assert.deepEqual(login.json, { error: 'mismatch' });
    }
    assert.equal((await signIn()).headers.get('location'), '/?auth=in');
  });

  test('the pending sign-up works once', async () => {
    const back = await signIn();
    assert.equal((await pickName('gina', pair(back, 'mt_pending'))).status, 201);
    const again = await pickName('gino', pair(back, 'mt_pending'));
    assert.equal(again.status, 401);
    assert.deepEqual(again.json, { error: 'google' });
  });

  test('409 taken for a name in use, in any case, and the pending sign-up is kept', async () => {
    await api.signup('Sam');
    const back = await signIn();
    const res = await pickName('sAM', pair(back, 'mt_pending'));
    assert.equal(res.status, 409);
    assert.deepEqual(res.json, { error: 'taken' });
    assert.equal(cookieOf(res), undefined);
    assert.equal(count('pending'), 1);
    assert.equal((await pickName('pat', pair(back, 'mt_pending'))).status, 201);
  });

  test('400 name for a bad name, and the pending sign-up is kept', async () => {
    const back = await signIn();
    for (const name of ['ab', 'has space', '', undefined, 42]) {
      const res = await pickName(name, pair(back, 'mt_pending'));
      assert.equal(res.status, 400, JSON.stringify(name));
      assert.deepEqual(res.json, { error: 'name' });
    }
    assert.equal(count('pending'), 1);
  });

  test('401 google with no pending sign-up, an unknown one, or one 15 minutes old', async () => {
    for (const cookie of [undefined, 'mt_pending=garbage', `mt_pending=${'A'.repeat(43)}`]) {
      const res = await pickName('gina', cookie);
      assert.equal(res.status, 401, String(cookie));
      assert.deepEqual(res.json, { error: 'google' });
    }
    const back = await signIn();
    api.clock.t += PENDING_LIFE;
    const late = await pickName('gina', pair(back, 'mt_pending'));
    assert.equal(late.status, 401);
    assert.deepEqual(late.json, { error: 'google' });
    assert.equal(count('users'), 0);
  });

  test('two Google accounts make two accounts', async () => {
    const a = await newAccount('gina', 'g-1');
    const b = await newAccount('gino', 'g-2');
    assert.deepEqual((await api.call('GET', '/api/me', { cookie: a })).json, { name: 'gina' });
    assert.deepEqual((await api.call('GET', '/api/me', { cookie: b })).json, { name: 'gino' });
  });

  test('a Google account linked meanwhile (two tabs): 200, signed in to it, no second account', async () => {
    const first = await signIn();
    const second = await signIn();
    assert.equal((await pickName('gina', pair(first, 'mt_pending'))).status, 201);
    const res = await pickName('gino', pair(second, 'mt_pending'));
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { name: 'gina' });
    assert.deepEqual((await api.call('GET', '/api/me', { cookie: cookieOf(res) })).json, { name: 'gina' });
    assert.equal(count('users'), 1);
    assert.equal(count('pending'), 0);
  });

  test('a reset code from the CLI can give a Google account a password', async () => {
    await newAccount('gina');
    const code = createCode(api.db, { userId: findUser(api.db, 'gina').id, now: api.clock.t });
    const res = await api.call('POST', '/api/signup', { body: { invite: code, name: 'gina', password: 'password1' } });
    assert.equal(res.status, 201);
    assert.equal((await api.call('POST', '/api/login', { body: { name: 'gina', password: 'password1' } })).status, 200);
  });
});

describe('POST /api/google/name, as a sign-up', () => {
  test('with OPEN_SIGNUP off, a new account is 403 invite, and nothing is made', async () => {
    await api.close();
    api = await startApi({ openSignup: false, google: GOOGLE, fetch: (...args) => stub.fetch(...args), log: (line) => logs.push(String(line)) });
    const back = await signIn();
    const res = await pickName('gina', pair(back, 'mt_pending'));
    assert.equal(res.status, 403);
    assert.deepEqual(res.json, { error: 'invite' });
    assert.equal(cookieOf(res), undefined);
    assert.equal(count('users'), 0);
  });

  test('counts against the address\'s 5 accounts an hour, with password sign-ups', async () => {
    const ip = '192.0.2.40';
    const later = () => { api.clock.t += 61 * 1000; };
    for (let i = 0; i < 3; i++) {
      assert.equal((await api.call('POST', '/api/signup', { body: { name: `pw_${i}`, password: 'password1' }, ip })).status, 201);
      later();
    }
    const name = async (n, sub) => {
      stub.sub = sub;
      const back = await signIn();
      later();
      return api.call('POST', '/api/google/name', { body: { name: n }, cookie: pair(back, 'mt_pending'), ip });
    };
    assert.equal((await name('gg_0', 'g-10')).status, 201);
    later();
    assert.equal((await name('gg_1', 'g-11')).status, 201);
    later();
    const sixth = await name('gg_2', 'g-12');
    assert.equal(sixth.status, 429);
    assert.deepEqual(sixth.json, { error: 'rate' });
    assert.equal(count('users'), 5);
    const sixthSignup = await api.call('POST', '/api/signup', { body: { name: 'pw_9', password: 'password1' }, ip });
    assert.equal(sixthSignup.status, 429);
  });
});

test('a password check against a Google-only account takes as long as a real one', async () => {
  const { DUMMY_HASH } = await import('../auth.mjs');
  const time = async (stored) => {
    const t = performance.now();
    for (let i = 0; i < 3; i++) await verifyPassword('password1', stored);
    return performance.now() - t;
  };
  await time(DUMMY_HASH);                                 // warm
  const real = await time(DUMMY_HASH), google = await time('!');
  assert.equal(await verifyPassword('password1', '!'), false);
  assert.ok(google > real / 2, `'!' took ${google.toFixed(1)}ms, a real hash ${real.toFixed(1)}ms`);
});
