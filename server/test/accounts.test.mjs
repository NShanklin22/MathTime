// Sign-up, log in, log out, /api/me, sessions and their cookie (accounts spec §1, §6).
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, cookieOf, record } from './helpers.mjs';
import { createCode, createUser, openDb, DAY } from '../store.mjs';
import { addressKey } from '../app.mjs';
import { run as cli } from '../cli.mjs';

let api;
beforeEach(async () => { api = await startApi(); });
afterEach(() => api.close());

const signup = (body, opts) => api.call('POST', '/api/signup', { body, ...opts });
const login = (body, opts) => api.call('POST', '/api/login', { body, ...opts });
const me = (cookie) => api.call('GET', '/api/me', { cookie });

describe('POST /api/signup', () => {
  test('201 {name} with a session cookie, which /api/me then knows', async () => {
    const res = await signup({ invite: api.invite(), name: 'Sam_1', password: 'password1' });
    assert.equal(res.status, 201);
    assert.deepEqual(res.json, { name: 'Sam_1' });
    const cookie = cookieOf(res);
    assert.match(cookie, /^mt_session=[A-Za-z0-9_-]{43}$/);
    assert.deepEqual((await me(cookie)).json, { name: 'Sam_1' });
  });

  test('the invite code is accepted in lower case and with spaces around it', async () => {
    const res = await signup({ invite: `  ${api.invite().toLowerCase()} `, name: 'sam', password: 'password1' });
    assert.equal(res.status, 201);
  });

  test('400 name when the name is not 3-20 letters, digits, _ or -', async () => {
    for (const name of ['ab', 'a'.repeat(21), 'has space', 'émile', 'a.b', '', undefined, 42]) {
      const res = await signup({ invite: api.invite(), name, password: 'password1' });
      assert.equal(res.status, 400, `name ${JSON.stringify(name)}`);
      assert.deepEqual(res.json, { error: 'name' });
    }
    for (const name of ['abc', 'a'.repeat(20), 'A-b_9']) {
      assert.equal((await signup({ invite: api.invite(), name, password: 'password1' })).status, 201, name);
    }
  });

  test('400 password when it is under 8 characters', async () => {
    for (const password of ['', '1234567', 'ééééééé', undefined, 12345678]) {
      const res = await signup({ invite: api.invite(), name: 'sam', password });
      assert.equal(res.status, 400, `password ${JSON.stringify(password)}`);
      assert.deepEqual(res.json, { error: 'password' });
    }
    assert.equal((await signup({ invite: api.invite(), name: 'sam', password: '12345678' })).status, 201);
  });

  test('a bad name or password does not use up the invite', async () => {
    const invite = api.invite();
    await signup({ invite, name: 'x', password: 'password1' });
    await signup({ invite, name: 'sam', password: 'short' });
    assert.equal((await signup({ invite, name: 'sam', password: 'password1' })).status, 201);
  });

  test('403 invite when the code is unknown, missing, used or expired', async () => {
    assert.deepEqual((await signup({ invite: 'MATH-AAAA-BBBB', name: 'sam', password: 'password1' })).json,
      { error: 'invite' });
    assert.equal((await signup({ name: 'sam', password: 'password1' })).status, 403);

    const used = api.invite();
    assert.equal((await signup({ invite: used, name: 'sam', password: 'password1' })).status, 201);
    const again = await signup({ invite: used, name: 'pat', password: 'password1' });
    assert.equal(again.status, 403);
    assert.deepEqual(again.json, { error: 'invite' });

    const old = api.invite();
    api.clock.t += 14 * DAY;
    const expired = await signup({ invite: old, name: 'kim', password: 'password1' });
    assert.equal(expired.status, 403);
    assert.deepEqual(expired.json, { error: 'invite' });
  });

  test('an invite still works just before 14 days', async () => {
    const code = api.invite();
    api.clock.t += 14 * DAY - 1000;
    assert.equal((await signup({ invite: code, name: 'kim', password: 'password1' })).status, 201);
  });

  test('409 taken when the name exists in any case, and the invite stays unused', async () => {
    await api.signup('Sam');
    const invite = api.invite();
    const res = await signup({ invite, name: 'sAM', password: 'password1' });
    assert.equal(res.status, 409);
    assert.deepEqual(res.json, { error: 'taken' });
    assert.equal((await signup({ invite, name: 'Pat', password: 'password1' })).status, 201);
  });

  test('an invite code shaped like MATH-XXXX-XXXX', () => {
    assert.match(api.invite(), /^MATH-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});

describe('POST /api/login', () => {
  test('200 {name} as typed at sign-up, whatever case is typed now, with a new cookie', async () => {
    const first = await api.signup('SamK');
    const res = await login({ name: 'samk', password: 'password1' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { name: 'SamK' });
    const second = cookieOf(res);
    assert.ok(second && second !== first);
    assert.equal((await me(first)).status, 200, 'the other device stays logged in');
    assert.equal((await me(second)).status, 200);
  });

  test('401 mismatch for a wrong password, an unknown name or missing fields', async () => {
    await api.signup('sam');
    for (const body of [
      { name: 'sam', password: 'password2' },
      { name: 'nobody', password: 'password1' },
      { name: 'sam' },
      {},
      { name: ['sam'], password: 'password1' },
    ]) {
      const res = await login(body);
      assert.equal(res.status, 401, JSON.stringify(body));
      assert.deepEqual(res.json, { error: 'mismatch' });
      assert.equal(cookieOf(res), undefined);
    }
  });

  test('the stored password is a salted scrypt hash, never the password', async () => {
    await api.signup('sam', 'password1');
    await api.signup('pat', 'password1');
    const rows = api.db.prepare('SELECT pw_hash FROM users').all();
    for (const { pw_hash } of rows) {
      assert.match(pw_hash, /^scrypt\$16384\$8\$1\$/);
      assert.ok(!pw_hash.includes('password1'));
    }
    assert.notEqual(rows[0].pw_hash, rows[1].pw_hash, 'each has its own salt');
  });
});

describe('POST /api/logout and GET /api/me', () => {
  test('/api/me is 401 with no cookie or an unknown one', async () => {
    assert.equal((await me()).status, 401);
    assert.equal((await me('mt_session=' + 'A'.repeat(43))).status, 401);
    assert.equal((await me('mt_session=garbage')).status, 401);
  });

  test('logout answers 204, ends that session only, and clears the cookie', async () => {
    const a = await api.signup('sam');
    const b = cookieOf(await login({ name: 'sam', password: 'password1' }));
    const res = await api.call('POST', '/api/logout', { cookie: a });
    assert.equal(res.status, 204);
    assert.equal(res.text, '');
    assert.match(res.setCookie[0], /^mt_session=; Max-Age=0; Path=\/api; HttpOnly; Secure; SameSite=Strict$/);
    assert.equal((await me(a)).status, 401);
    assert.equal((await me(b)).status, 200);
  });

  test('logout without a session is still 204', async () => {
    assert.equal((await api.call('POST', '/api/logout')).status, 204);
  });

  test('the session token is stored only as its SHA-256', async () => {
    const cookie = await api.signup('sam');
    const token = cookie.split('=')[1];
    const { token_hash } = api.db.prepare('SELECT token_hash FROM sessions').get();
    const { createHash } = await import('node:crypto');
    assert.equal(token_hash, createHash('sha256').update(token).digest('hex'));
    assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').get(token).n, 0);
  });
});

describe('the cookie', () => {
  test('mt_session, HttpOnly, Secure, SameSite=Strict, Path=/api, for a year', async () => {
    const res = await signup({ invite: api.invite(), name: 'sam', password: 'password1' });
    assert.equal(res.setCookie.length, 1);
    assert.match(res.setCookie[0],
      /^mt_session=[A-Za-z0-9_-]{43}; Max-Age=31536000; Path=\/api; HttpOnly; Secure; SameSite=Strict$/);
    const loginRes = await login({ name: 'sam', password: 'password1' });
    assert.match(loginRes.setCookie[0], /; Max-Age=31536000; Path=\/api; HttpOnly; Secure; SameSite=Strict$/);
  });

  test('COOKIE_INSECURE drops Secure only', async () => {
    const insecure = await startApi({ cookieSecure: false });
    try {
      const res = await insecure.call('POST', '/api/signup',
        { body: { invite: insecure.invite(), name: 'sam', password: 'password1' } });
      assert.match(res.setCookie[0], /^mt_session=[A-Za-z0-9_-]{43}; Max-Age=31536000; Path=\/api; HttpOnly; SameSite=Strict$/);
    } finally {
      await insecure.close();
    }
  });

  test('renewed on use at most once a day', async () => {
    const cookie = await api.signup('sam');
    api.clock.t += DAY - 1000;
    assert.deepEqual((await me(cookie)).setCookie, [], 'not within the first day');
    api.clock.t += 2000;
    const renewed = await me(cookie);
    assert.equal(renewed.setCookie.length, 1);
    assert.match(renewed.setCookie[0], new RegExp(`^${cookie}; Max-Age=31536000; Path=/api; HttpOnly; Secure; SameSite=Strict$`));
    api.clock.t += 1000;
    assert.deepEqual((await me(cookie)).setCookie, [], 'not again the same day');
    assert.equal((await api.call('GET', '/api/best', { cookie })).setCookie.length, 0);
    api.clock.t += DAY;
    assert.equal((await api.call('GET', '/api/best', { cookie })).setCookie.length, 1, 'any use renews');
  });

  test('a session lasts a year from its last renewal, then 401 and the cookie is cleared', async () => {
    const used = await api.signup('sam');
    const idle = cookieOf(await login({ name: 'sam', password: 'password1' }));
    api.clock.t += 200 * DAY;
    assert.equal((await me(used)).status, 200);   // renewed: a year from now
    api.clock.t += 200 * DAY;
    assert.equal((await me(used)).status, 200);
    const gone = await me(idle);
    assert.equal(gone.status, 401);
    assert.match(gone.setCookie[0], /^mt_session=; Max-Age=0;/);
  });
});

describe('password reset (cli.mjs reset)', () => {
  const resetCode = (name) => cli(api.db, ['reset', name], api.clock.t).out.split('\n')[0];

  test('sign-up with the code and that name sets the new password and ends old sessions', async () => {
    const old = await api.signup('SamK', 'old-password');
    await api.call('POST', '/api/runs', { cookie: old, body: record() });
    const code = resetCode('samk');
    assert.match(code, /^MATH-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const res = await signup({ invite: code, name: 'samk', password: 'new-password' });
    assert.equal(res.status, 201);
    assert.deepEqual(res.json, { name: 'SamK' }, 'the name as first typed');
    assert.equal((await me(cookieOf(res))).status, 200);
    assert.equal((await me(old)).status, 401, 'old sessions end');
    assert.equal((await login({ name: 'SamK', password: 'old-password' })).status, 401);
    assert.equal((await login({ name: 'SamK', password: 'new-password' })).status, 200);
    assert.deepEqual(Object.keys((await api.call('GET', '/api/best', { cookie: cookieOf(res) })).json), ['1'],
      'runs are kept');
    assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1, 'no new account');
  });

  test('the code works only with that name, once, for 14 days', async () => {
    await api.signup('sam');
    await api.signup('pat');
    const code = resetCode('sam');
    assert.deepEqual((await signup({ invite: code, name: 'pat', password: 'password9' })).json, { error: 'invite' });
    assert.deepEqual((await signup({ invite: code, name: 'newbie', password: 'password9' })).json, { error: 'invite' });
    assert.equal((await signup({ invite: code, name: 'sam', password: 'password9' })).status, 201);
    assert.equal((await signup({ invite: code, name: 'sam', password: 'password8' })).status, 403);

    const late = resetCode('sam');
    api.clock.t += 14 * DAY;
    assert.equal((await signup({ invite: late, name: 'sam', password: 'password7' })).status, 403);
  });

  test('a short new password is refused and keeps the code', async () => {
    await api.signup('sam');
    const code = resetCode('sam');
    assert.deepEqual((await signup({ invite: code, name: 'sam', password: 'short' })).json, { error: 'password' });
    assert.equal((await signup({ invite: code, name: 'sam', password: 'long-enough' })).status, 201);
  });

  test('an ordinary invite can not take over an existing name', async () => {
    await api.signup('sam');
    assert.equal((await signup({ invite: createCode(api.db, { now: api.clock.t }), name: 'sam', password: 'password9' })).status, 409);
  });
});

describe('rate limits on login and sign-up', () => {
  test('10 tries a minute per address, then 429 rate', async () => {
    await api.signup('sam');
    for (let i = 0; i < 10; i++) {
      assert.equal((await login({ name: `user${i}`, password: 'nope-nope' }, { ip: '1.2.3.4' })).status, 401);
    }
    const res = await login({ name: 'sam', password: 'password1' }, { ip: '1.2.3.4' });
    assert.equal(res.status, 429);
    assert.deepEqual(res.json, { error: 'rate' });
    assert.equal((await signup({ invite: api.invite(), name: 'pat', password: 'password1' }, { ip: '1.2.3.4' })).status,
      429, 'sign-up shares the limit');
    assert.equal((await login({ name: 'sam', password: 'password1' }, { ip: '5.6.7.8' })).status, 200,
      'another address is fine');
    api.clock.t += 60 * 1000;
    assert.equal((await login({ name: 'sam', password: 'password1' }, { ip: '1.2.3.4' })).status, 200,
      'a minute later it works again');
  });

  test('failed log-ins from other addresses never lock Sam out', async () => {
    await api.signup('Sam');
    for (let i = 0; i < 30; i++) {
      // A new address each time (the helper's default), in any case.
      assert.equal((await login({ name: i % 2 ? 'sam' : 'SAM', password: 'wrong-pass' })).status, 401);
    }
    assert.equal((await login({ name: 'sAm', password: 'password1' }, { ip: '198.51.100.7' })).status, 200);
  });

  test('10 failed log-ins a minute per name from one address, when the address limit is higher', async () => {
    const school = await startApi({ addressLimit: 100 });
    const at = (ip, name, password) => school.call('POST', '/api/login', { body: { name, password }, ip });
    try {
      await school.signup('Sam');
      await school.signup('pat');
      for (let i = 0; i < 10; i++) {
        assert.equal((await at('192.0.2.1', i % 2 ? 'sam' : 'SAM', 'wrong-pass')).status, 401);
      }
      const res = await at('192.0.2.1', 'sAm', 'password1');
      assert.equal(res.status, 429);
      assert.deepEqual(res.json, { error: 'rate' });
      assert.equal((await at('192.0.2.1', 'pat', 'password1')).status, 200, 'other names from there are fine');
      assert.equal((await at('192.0.2.2', 'sam', 'password1')).status, 200, 'Sam from elsewhere is fine');
      const v6 = (n) => `2001:db8:5:6:${n}::1`;
      for (let i = 0; i < 10; i++) assert.equal((await at(v6(i), 'pat', 'wrong-pass')).status, 401);
      assert.equal((await at(v6('ff'), 'pat', 'password1')).status, 429, 'one IPv6 /64 is one address');
      school.clock.t += 61 * 1000;
      assert.equal((await at('192.0.2.1', 'sam', 'password1')).status, 200, 'a minute later');
    } finally {
      await school.close();
    }
  });

  test('only failed log-ins count against a name', async () => {
    const school = await startApi({ addressLimit: 100 });
    const at = (name, password) => school.call('POST', '/api/login', { body: { name, password }, ip: '192.0.2.1' });
    try {
      await school.signup('sam');
      for (let i = 0; i < 25; i++) assert.equal((await at('sam', 'password1')).status, 200, `log-in ${i + 1}`);
      for (let i = 0; i < 9; i++) assert.equal((await at('sam', 'wrong-pass')).status, 401);
      assert.equal((await at('sam', 'password1')).status, 200, '9 failures still let Sam in');
      assert.equal((await at('sam', 'wrong-pass')).status, 401);
      assert.equal((await at('sam', 'password1')).status, 429, 'the 10th failure closes it');
    } finally {
      await school.close();
    }
  });

  test('sign-up is limited per address, not per name', async () => {
    for (let i = 0; i < 12; i++) {
      assert.equal((await signup({ invite: 'MATH-NOPE-NOPE', name: 'sam', password: 'password1' })).status, 403);
    }
    assert.equal((await signup({ invite: api.invite(), name: 'sam', password: 'password1' })).status, 201);
  });

  test('without TRUST_PROXY, X-Real-IP is ignored: every try counts against the socket address', async () => {
    const direct = await startApi({ trustProxy: false });
    try {
      for (let i = 0; i < 10; i++) {
        const res = await direct.call('POST', '/api/login', { body: { name: `user${i}`, password: 'nope-nope' } });
        assert.equal(res.status, 401);
      }
      const res = await direct.call('POST', '/api/login',
        { body: { name: 'fresh', password: 'nope-nope' }, ip: '203.0.113.9' });
      assert.equal(res.status, 429, 'a new X-Real-IP does not help');
    } finally {
      await direct.close();
    }
  });

  test('with TRUST_PROXY, IPv6 callers share a limit per /64', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await login({ name: `user${i}`, password: 'nope-nope' }, { ip: `2001:db8:1:2:${i.toString(16)}::1` });
      assert.equal(res.status, 401);
    }
    assert.equal((await login({ name: 'x9', password: 'nope-nope' }, { ip: '2001:db8:1:2:ffff::9' })).status, 429);
    assert.equal((await login({ name: 'x9', password: 'nope-nope' }, { ip: '2001:db8:1:3::1' })).status, 401,
      'the next /64 is separate');
  });

  test('other routes are not limited', async () => {
    const cookie = await api.signup('sam');
    for (let i = 0; i < 15; i++) assert.equal((await me(cookie)).status, 200);
  });
});

describe('addressKey', () => {
  test('IPv4 as it is, IPv6 by its /64, IPv4-mapped IPv6 as IPv4', () => {
    assert.equal(addressKey('203.0.113.9'), '203.0.113.9');
    assert.equal(addressKey('::ffff:203.0.113.9'), '203.0.113.9');
    assert.equal(addressKey('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64');
    assert.equal(addressKey('2001:DB8:0001:0002::9'), '2001:db8:1:2::/64');
    assert.equal(addressKey('2001:db8::1'), '2001:db8:0:0::/64');
    assert.equal(addressKey('::1'), '0:0:0:0::/64');
    assert.equal(addressKey('fe80::1%eth0'), 'fe80:0:0:0::/64');
  });
});

describe('invites under load', () => {
  test('two sign-ups at once with one invite: exactly one succeeds', async () => {
    for (let round = 0; round < 5; round++) {
      const invite = api.invite();
      const results = await Promise.all([
        signup({ invite, name: `first${round}`, password: 'password1' }),
        signup({ invite, name: `second${round}`, password: 'password1' }),
      ]);
      const statuses = results.map((r) => r.status).sort();
      assert.deepEqual(statuses, [201, 403], `round ${round}`);
    }
    assert.equal(api.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 5);
  });

  test('two sign-ups at once for one name with two invites: one account, one 409', async () => {
    const results = await Promise.all([
      signup({ invite: api.invite(), name: 'Sam', password: 'password1' }),
      signup({ invite: api.invite(), name: 'sam', password: 'password1' }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(api.db.prepare("SELECT COUNT(*) AS n FROM codes WHERE used_at IS NOT NULL").get().n, 1,
      'the loser keeps its invite');
  });

  test('a wrong code is refused before the password is hashed', async () => {
    const started = performance.now();
    for (let i = 0; i < 9; i++) await signup({ invite: 'MATH-NOPE-NOPE', name: 'sam', password: 'password1' }, { ip: '1.1.1.1' });
    const wrong = (performance.now() - started) / 9;
    const t0 = performance.now();
    await api.signup('pat');
    const right = performance.now() - t0;
    assert.ok(wrong < right / 2, `a wrong code took ${wrong.toFixed(1)}ms, a sign-up ${right.toFixed(1)}ms`);
  });
});

describe('expired sessions are swept', () => {
  test('once a day, on the first request after', async () => {
    await api.signup('sam');
    const count = () => api.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
    assert.equal(count(), 1);
    api.clock.t += 366 * DAY;
    await api.call('GET', '/api/healthz');
    assert.equal(count(), 0, 'swept by an unrelated request');
  });

  test('not more than once a day', async () => {
    const count = () => api.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
    api.clock.t += DAY;
    await api.call('GET', '/api/healthz');          // a sweep now
    await api.signup('sam');
    // Make its session expire a moment from now, without any request touching it.
    api.db.prepare('UPDATE sessions SET expires_at = ?').run(api.clock.t + 1000);
    api.clock.t += 2000;
    await api.call('GET', '/api/healthz');
    assert.equal(count(), 1, 'within the day: left for the next sweep');
    api.clock.t += DAY;
    await api.call('GET', '/api/healthz');
    assert.equal(count(), 0);
  });

  test('when the app starts', async () => {
    const db = openDb(':memory:');
    const t = Date.parse('2026-11-09T12:00:00Z');
    const userId = createUser(db, { name: 'sam', pwHash: 'x', now: 0 });
    db.prepare('INSERT INTO sessions (token_hash, user_id, renewed_at, expires_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)')
      .run('old', userId, 0, t - 1, 'live', userId, t, t + DAY);
    const started = await startApi({ db, t });
    try {
      assert.deepEqual(db.prepare('SELECT token_hash FROM sessions').all().map((r) => r.token_hash), ['live']);
    } finally {
      await started.close();
    }
  });
});
