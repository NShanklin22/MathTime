import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../../src/queue.js';
import { createAccount, checkSignup, loginResult, mergedBest, pruneRuns, ERRORS } from '../../src/account.js';

// An in-memory stand-in for localStorage.
const memory = (init = {}) => {
  const items = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    items,
    getItem: key => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: key => { items.delete(key); },
  };
};
const got = (storage, key) => JSON.parse(storage.getItem(key));
const run = (id, level, totalMs) => ({ id, level, finishedAt: '2026-11-01T09:30:00.000Z', totalMs, misses: 0, problems: [] });

// A fake API: `answers[path]` is a status, a function of the request
// giving one ({status, body}), or 'down' (no answer). Every request is logged.
function fakeFetch(answers) {
  const log = [];
  const fetch = async (path, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    log.push({ path, method: init.method, body, init });
    let a = answers[path];
    if (typeof a === 'function') a = a(body);
    if (a === 'down' || a === undefined) throw new TypeError('Failed to fetch');
    const { status, body: out } = typeof a === 'number' ? { status: a } : a;
    return { status, json: async () => { if (out === undefined) throw new SyntaxError('no body'); return out; } };
  };
  return { fetch, log };
}

const setup = (init, answers) => {
  const storage = memory(init);
  const queue = createQueue(storage);
  const api = fakeFetch(answers);
  const account = createAccount({ queue, storage, fetch: api.fetch });
  return { storage, queue, account, log: api.log };
};

test('a sign-up is checked as the API checks it: the name, then the password', () => {
  assert.equal(checkSignup({ name: 'sam', password: 'password1' }), null);
  assert.equal(checkSignup({ name: ' Sam_2-x ', password: '12345678' }), null);
  assert.equal(checkSignup({ name: 'sa', password: 'password1' }), 'name');
  assert.equal(checkSignup({ name: 'a'.repeat(21), password: 'password1' }), 'name');
  assert.equal(checkSignup({ name: 'sam!', password: 'x' }), 'name');
  assert.equal(checkSignup({ name: 'sam', password: '1234567' }), 'password');
});

test('every answer to log in or sign up means a name or an error in words', () => {
  assert.deepEqual(loginResult(200, { name: 'Sam' }), { name: 'Sam' });
  assert.deepEqual(loginResult(201, { name: 'Sam' }), { name: 'Sam' });
  assert.deepEqual(loginResult(401, { error: 'mismatch' }), { error: 'mismatch' });
  assert.deepEqual(loginResult(403, { error: 'invite' }), { error: 'invite' });
  assert.deepEqual(loginResult(409, { error: 'taken' }), { error: 'taken' });
  assert.deepEqual(loginResult(400, { error: 'name' }), { error: 'name' });
  assert.deepEqual(loginResult(400, { error: 'password' }), { error: 'password' });
  assert.deepEqual(loginResult(429, { error: 'rate' }), { error: 'rate' });
  assert.deepEqual(loginResult(429, null), { error: 'rate' });
  assert.deepEqual(loginResult(500, null), { error: 'offline' });
  assert.deepEqual(loginResult(502, { error: 'name' }), { error: 'offline' });
  for (const { error } of [loginResult(401), loginResult(403, { error: 'invite' }), loginResult(429), loginResult(0)]) {
    assert.equal(typeof ERRORS[error], 'string');
  }
  assert.equal(ERRORS.rate, 'Too many tries: wait a minute');
  assert.equal(ERRORS.offline, "Can't reach the server: try again");
});

test("a level's best merges the account's bests with the runs not yet stored", () => {
  assert.equal(mergedBest(1, null, []), null);
  assert.equal(mergedBest(1, { 1: 70000 }, []), 70000);
  assert.equal(mergedBest(1, { 1: 70000 }, [run('a', 1, 65000), run('b', 2, 1000)]), 65000);
  assert.equal(mergedBest(1, { 1: 60000 }, [run('a', 1, 65000)]), 60000);
  assert.equal(mergedBest(2, { 1: 60000 }, [run('a', 1, 65000)]), null);
});

test('the cached name shows until /api/me answers; 200 signs in, 401 out', async () => {
  const a = setup({ 'mathtime.account': { name: 'sam' } }, { '/api/me': 401 });
  assert.equal(a.account.name, 'sam');
  await a.account.check();
  assert.equal(a.account.name, null);
  assert.equal(got(a.storage, 'mathtime.account'), null);

  const b = setup({}, { '/api/me': { status: 200, body: { name: 'Sam' } }, '/api/best': { status: 200, body: {} } });
  assert.equal(b.account.name, null);
  await b.account.check();
  assert.equal(b.account.name, 'Sam');
  assert.deepEqual(got(b.storage, 'mathtime.account'), { name: 'Sam' });
});

test('with no answer, or one it does not expect, the cached state stays', async () => {
  const a = setup({ 'mathtime.account': { name: 'sam' } }, { '/api/me': 'down' });
  await a.account.check();
  assert.equal(a.account.name, 'sam');
  const b = setup({ 'mathtime.account': { name: 'sam' } }, { '/api/me': 502 });
  await b.account.check();
  assert.equal(b.account.name, 'sam');
});

test('requests are same-origin JSON, with the session cookie', async () => {
  const a = setup({}, { '/api/login': { status: 200, body: { name: 'sam' } }, '/api/runs': 201, '/api/best': { status: 200, body: {} } });
  await a.account.enter('login', { name: ' sam ', password: 'password1' });
  const [req] = a.log;
  assert.equal(req.path, '/api/login');
  assert.equal(req.method, 'POST');
  assert.equal(req.init.credentials, 'same-origin');
  assert.equal(req.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(req.body, { name: 'sam', password: 'password1' });
});

test('sign up sends the invite, the name and the password; errors come back in words', async () => {
  const a = setup({}, { '/api/signup': body => (body.invite === 'GOOD' ? { status: 201, body: { name: body.name } } : { status: 403, body: { error: 'invite' } }) });
  assert.deepEqual(await a.account.enter('signup', { invite: 'BAD', name: 'alex', password: 'password1' }), { error: 'invite' });
  assert.equal(a.account.name, null);
  const b = setup({}, { '/api/signup': 'down' });
  assert.deepEqual(await b.account.enter('signup', { invite: 'X', name: 'alex', password: 'password1' }), { error: 'offline' });
});

// The outbox's entries, by id and owner.
const waiting = storage => got(storage, 'mathtime.outbox');

// A storage with room for `limit` characters in all, as localStorage's quota.
const quota = (limit, init) => {
  const storage = memory(init);
  const size = () => [...storage.items].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const set = storage.setItem;
  storage.setItem = (key, value) => {
    const before = storage.items.get(key);
    set(key, value);
    if (size() > limit) {
      if (before === undefined) storage.items.delete(key); else storage.items.set(key, before);
      throw new Error('QuotaExceededError (test)');
    }
  };
  return storage;
};

test('runs finished signed out go up once, to the account that logs in next', async () => {
  const stored = [];
  const a = setup({}, {
    '/api/login': { status: 200, body: { name: 'sam' } },
    '/api/runs': body => { stored.push(body.id); return 201; },
    '/api/best': { status: 200, body: { 1: 72400 } },
    '/api/logout': 204,
  });
  await a.account.keep(run('a', 1, 72400));
  await a.account.keep(run('b', 5, 90000));
  assert.deepEqual(stored, []);                       // signed out: nothing goes up
  assert.deepEqual(waiting(a.storage), [{ id: 'a', name: null }, { id: 'b', name: null }]);
  await a.account.enter('login', { name: 'sam', password: 'password1' });
  await a.account.settled();
  assert.deepEqual(stored, ['a', 'b']);
  assert.deepEqual(waiting(a.storage), []);
  await a.account.logout();
  await a.account.enter('login', { name: 'sam', password: 'password1' });
  await a.account.settled();
  assert.deepEqual(stored, ['a', 'b']);               // never a second time
  assert.equal(a.queue.runs().length, 2);             // each its level's fastest: kept
});

test('runs kept before accounts go up once, as if finished signed out', async () => {
  const stored = [];
  const a = setup({ 'mathtime.runs': [run('old', 1, 72400)] }, {
    '/api/me': { status: 200, body: { name: 'sam' } },
    '/api/runs': body => { stored.push(body.id); return 201; },
    '/api/best': { status: 200, body: {} },
  });
  assert.deepEqual(waiting(a.storage), [{ id: 'old', name: null }]);
  await a.account.check();
  assert.deepEqual(stored, ['old']);
});

test('a run goes up only to the account it was finished in, or one finished signed out', async () => {
  const sent = [];
  let session = 'sam';
  const a = setup({ 'mathtime.account': { name: 'sam' } }, {
    '/api/runs': body => { sent.push([session, body.id]); return session === 'sam' ? 'down' : 201; },
    '/api/login': body => { session = body.name; return { status: 200, body: { name: body.name } }; },
    '/api/logout': 204,
    '/api/best': { status: 200, body: {} },
  });
  await a.account.keep(run('sams', 1, 50000));        // offline: it waits, sam's
  await a.account.logout();
  await a.account.keep(run('nobodys', 1, 60000));     // signed out
  assert.deepEqual(waiting(a.storage), [{ id: 'sams', name: 'sam' }, { id: 'nobodys', name: null }]);
  assert.equal(a.account.best(1), 50000);             // signed out: this browser's runs
  await a.account.enter('login', { name: 'alex', password: 'password1' });
  await a.account.settled();
  assert.deepEqual(sent.at(-1), ['alex', 'nobodys']);
  assert.ok(!sent.some(([who, id]) => who === 'alex' && id === 'sams'), "sam's run never goes to alex");
  assert.equal(a.account.best(1), 60000);             // alex's best leaves sam's run out
  assert.deepEqual(waiting(a.storage), [{ id: 'sams', name: 'sam' }]);
});

test('an answer that comes after the account changed is ignored, and the round stops', async () => {
  let release;
  const held = new Promise(r => { release = r; });
  const storage = memory({ 'mathtime.account': { name: 'sam' } });
  const queue = createQueue(storage);
  const posts = [];
  const account = createAccount({
    queue, storage,
    fetch: async (path, init) => {
      if (path === '/api/runs') {
        posts.push(JSON.parse(init.body).id);
        await held;
        return { status: 201, json: async () => ({}) };
      }
      return { status: 204, json: async () => { throw new SyntaxError('none'); } };
    },
  });
  const going = account.keep(run('a', 1, 50000));
  account.keep(run('b', 1, 40000));
  await account.logout();
  release();
  await going;
  assert.deepEqual(posts, ['a']);
  assert.deepEqual(waiting(storage).map(e => e.id), ['a', 'b']);
  assert.equal(storage.getItem('mathtime.best'), null);
});

test('a run leaves the outbox only on 200 or 201; it is sent again on the next finish', async () => {
  let answer = 'down';
  const sent = [];
  const a = setup({ 'mathtime.account': { name: 'sam' } }, { '/api/runs': body => { sent.push(body.id); return answer; } });
  await a.account.keep(run('a', 1, 72400));
  assert.deepEqual(waiting(a.storage), [{ id: 'a', name: 'sam' }]);
  answer = 500;
  await a.account.keep(run('b', 1, 70000));
  assert.deepEqual(sent, ['a', 'a']);                 // 500 stops the round
  assert.deepEqual(waiting(a.storage).map(e => e.id), ['a', 'b']);
  answer = 200;                                       // stored already: it leaves too
  await a.account.flush();
  assert.deepEqual(sent, ['a', 'a', 'a', 'b']);
  assert.deepEqual(waiting(a.storage), []);
});

test('a 400 drops that run from the outbox and the best, and goes on to the next; a 401 signs out', async () => {
  const a = setup({ 'mathtime.account': { name: 'sam' } }, { '/api/runs': body => (body.id === 'bad' ? 400 : 201) });
  await a.account.keep(run('bad', 1, 1));
  await a.account.keep(run('ok', 1, 70000));
  assert.deepEqual(waiting(a.storage), []);
  assert.equal(a.account.best(1), 70000);
  const b = setup({ 'mathtime.account': { name: 'sam' } }, { '/api/runs': 401 });
  await b.account.keep(run('a', 1, 70000));
  assert.equal(b.account.name, null);
  assert.deepEqual(waiting(b.storage), [{ id: 'a', name: 'sam' }]);
});

test("signed in, the best is the account's, merged with the runs waiting; signed out, this browser's", async () => {
  const a = setup({ 'mathtime.account': { name: 'sam' }, 'mathtime.runs': [run('old', 1, 50000)] }, {
    '/api/me': { status: 200, body: { name: 'sam' } },
    '/api/best': { status: 200, body: { 1: 60000, 6: 99000 } },
    '/api/runs': 'down',
  });
  await a.account.check();                            // the upload fails
  assert.equal(a.account.best(1), 50000);             // waiting, and faster
  assert.equal(a.account.best(6), 99000);             // from the account
  assert.deepEqual(got(a.storage, 'mathtime.best'), { name: 'sam', best: { 1: 60000, 6: 99000 } });
  const again = createAccount({ queue: a.queue, storage: a.storage, fetch: async () => { throw new TypeError('offline'); } });
  await again.check();
  assert.equal(again.best(6), 99000);                 // offline, the cached bests count
  await again.logout();
  assert.equal(again.best(6), null);                  // logged out: this browser's runs alone
  assert.equal(again.best(1), 50000);
});

test('the bests from the API are merged with those kept, the smaller of each', async () => {
  const a = setup({ 'mathtime.account': { name: 'sam' }, 'mathtime.best': { name: 'sam', best: { 1: 50000, 2: 90000 } } }, {
    '/api/me': { status: 200, body: { name: 'sam' } },
    '/api/best': { status: 200, body: { 1: 60000, 2: 80000, 3: 70000 } },
  });
  await a.account.check();
  assert.deepEqual(got(a.storage, 'mathtime.best'), { name: 'sam', best: { 1: 50000, 2: 80000, 3: 70000 } });
});

test('a run stored is merged into the cached bests as it leaves the outbox, fetched or not', async () => {
  const a = setup({ 'mathtime.account': { name: 'sam' }, 'mathtime.best': { name: 'sam', best: { 1: 80000 } } }, { '/api/runs': 201 });
  await a.account.keep(run('a', 1, 70000));
  assert.deepEqual(waiting(a.storage), []);
  assert.equal(a.account.best(1), 70000);
  const b = setup({ 'mathtime.account': { name: 'sam' } }, { '/api/runs': 201 });
  await b.account.keep(run('a', 3, 70000));
  assert.equal(b.account.best(3), 70000);
});

test("another account's cached bests are never shown", () => {
  const a = setup({ 'mathtime.account': { name: 'alex' }, 'mathtime.best': { name: 'sam', best: { 1: 50000 } } }, {});
  assert.equal(a.account.best(1), null);
});

test('signed in, the runs go up before the bests are asked for', async () => {
  const a = setup({ 'mathtime.runs': [run('a', 1, 70000)] }, { '/api/me': { status: 200, body: { name: 'sam' } }, '/api/runs': 201, '/api/best': { status: 200, body: {} } });
  await a.account.check();
  assert.deepEqual(a.log.map(r => r.path), ['/api/me', '/api/runs', '/api/best']);
});

test('a log out the server never heard is sent again on the next load, and signed out until it goes', async () => {
  const a = setup({ 'mathtime.account': { name: 'sam' } }, { '/api/logout': 'down', '/api/me': { status: 200, body: { name: 'sam' } } });
  await a.account.logout();
  assert.equal(got(a.storage, 'mathtime.logoutPending'), true);
  // The next load: still no answer. /api/me is never asked; signed out.
  const api = fakeFetch({ '/api/logout': 'down', '/api/me': { status: 200, body: { name: 'sam' } } });
  const next = createAccount({ queue: a.queue, storage: a.storage, fetch: api.fetch });
  assert.equal(next.name, null);
  await next.check();
  assert.equal(next.name, null);
  assert.deepEqual(api.log.map(r => r.path), ['/api/logout']);
  // The one after: it goes, then /api/me is asked.
  const ok = fakeFetch({ '/api/logout': 204, '/api/me': 401 });
  const third = createAccount({ queue: a.queue, storage: a.storage, fetch: ok.fetch });
  await third.check();
  assert.deepEqual(ok.log.map(r => r.path), ['/api/logout', '/api/me']);
  assert.equal(a.storage.getItem('mathtime.logoutPending'), null);
  assert.equal(third.name, null);
});

test('logging in clears a log out still waiting', async () => {
  const a = setup({ 'mathtime.logoutPending': true }, { '/api/login': { status: 200, body: { name: 'sam' } }, '/api/best': { status: 200, body: {} } });
  await a.account.enter('login', { name: 'sam', password: 'password1' });
  assert.equal(a.storage.getItem('mathtime.logoutPending'), null);
  assert.equal(a.account.name, 'sam');
});

test('a late 401 from /api/me does not undo a log in made since', async () => {
  let release;
  const held = new Promise(r => { release = r; });
  const storage = memory();
  const account = createAccount({
    queue: createQueue(storage), storage,
    fetch: async path => {
      if (path === '/api/me') { await held; return { status: 401, json: async () => ({ error: 'session' }) }; }
      if (path === '/api/login') return { status: 200, json: async () => ({ name: 'sam' }) };
      return { status: 200, json: async () => ({}) };
    },
  });
  const checking = account.check();
  await account.enter('login', { name: 'sam', password: 'password1' });
  release();
  await checking;
  assert.equal(account.name, 'sam');
});

test('a password is counted in characters, as the API counts it', () => {
  assert.equal(checkSignup({ name: 'sam', password: '🔑🔑🔑🔑🔑🔑🔑' }), 'password');   // 7, though 14 code units
  assert.equal(checkSignup({ name: 'sam', password: '🔑🔑🔑🔑🔑🔑🔑🔑' }), null);
});

test("runs the API has are dropped, all but each level's fastest and those waiting", () => {
  const runs = [run('a', 1, 70000), run('b', 1, 60000), run('c', 2, 50000), run('d', 1, 80000), run('e', 2, 40000)];
  assert.deepEqual(pruneRuns(runs, new Set(['d'])).map(r => r.id), ['b', 'd', 'e']);
});

test('after an upload, the runs the API stored are pruned', async () => {
  const a = setup({ 'mathtime.account': { name: 'sam' } }, { '/api/runs': 201 });
  for (const [id, ms] of [['a', 70000], ['b', 60000], ['c', 65000]]) await a.account.keep(run(id, 1, ms));
  assert.deepEqual(a.queue.runs().map(r => r.id), ['b']);
});

test('near the quota: stored runs make room, and a run that still will not fit goes up from memory', async () => {
  const big = id => ({ ...run(id, 1, 70000), problems: Array.from({ length: 20 }, () => ({ a: 1, b: 2, ms: 1000, misses: 0 })) });
  const one = JSON.stringify(big('xx')).length;
  const storage = quota(one * 3 + 300, { 'mathtime.account': { name: 'sam' } });   // room for about three runs
  let up = true;
  const stored = [];
  const queue = createQueue(storage);
  const account = createAccount({
    queue, storage,
    fetch: async (path, init) => {
      if (!up) throw new TypeError('offline');
      stored.push(JSON.parse(init.body).id);
      return { status: 201, json: async () => ({}) };
    },
  });
  // Uploaded runs make room: eight runs go up through room for three.
  for (let i = 0; i < 8; i++) await account.keep(big('r' + i));
  assert.equal(stored.length, 8);
  assert.ok(queue.runs().length <= 2);
  // Offline, the storage fills with runs waiting; one that won't fit is kept in memory.
  up = false;
  for (let i = 0; i < 4; i++) await account.keep(big('w' + i));
  const kept = new Set(queue.runs().map(r => r.id));
  assert.ok(['w0', 'w1', 'w2', 'w3'].some(id => !kept.has(id)), 'at least one did not fit');
  up = true;
  await account.flush();
  for (const id of ['w0', 'w1', 'w2', 'w3']) assert.ok(stored.includes(id), id + ' went up');
});

test('with the outbox unwritable on the first load, the runs kept go up from memory, and none is pruned unstored', async () => {
  const runs = [run('old1', 1, 72400), run('old2', 1, 80000), run('old3', 2, 90000)];
  const storage = memory({ 'mathtime.runs': runs, 'mathtime.account': { name: 'sam' } });
  const set = storage.setItem;
  let full = true;
  storage.setItem = (key, value) => {
    if (full && key === 'mathtime.outbox') throw new Error('QuotaExceededError (test)');
    set(key, value);
  };
  const stored = [];
  const account = createAccount({
    queue: createQueue(storage), storage,
    fetch: async (path, init) => {
      if (path !== '/api/runs') return { status: 200, json: async () => ({}) };
      const id = JSON.parse(init.body).id;
      if (id === 'old2') throw new TypeError('offline');   // this one doesn't get through
      stored.push(id);
      return { status: 201, json: async () => ({}) };
    },
  });
  assert.equal(storage.getItem('mathtime.outbox'), null);
  await account.flush();
  assert.deepEqual(stored, ['old1']);                       // stops at old2's failure
  // Nothing dropped that the API hasn't got: old2 and old3 stay.
  assert.deepEqual(createQueue(storage).runs().map(r => r.id), ['old1', 'old2', 'old3']);
});

test('a run kept but whose outbox entry could not be written stops prune() dropping runs not known to be stored', async () => {
  const storage = memory({ 'mathtime.account': { name: 'sam' } });
  const queue = createQueue(storage);
  let up = false;
  const account = createAccount({
    queue, storage,
    fetch: async () => {
      if (!up) throw new TypeError('offline');
      return { status: 201, json: async () => ({}) };
    },
  });
  await account.keep(run('a', 1, 70000));                   // waits, in the outbox
  const set = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === 'mathtime.outbox') throw new Error('QuotaExceededError (test)');
    set(key, value);
  };
  await account.keep(run('b', 1, 80000));                   // kept, its entry lost
  storage.setItem = set;
  await account.keep(run('c', 1, 75000));                   // fine again, waits
  up = true;
  await account.flush();
  // a, b, c all went up; a is the fastest; b and c, stored here, may go.
  assert.deepEqual(queue.runs().map(r => r.id), ['a']);
  // Had b not been sent (its entry lost), it would have stayed.
  const storage2 = memory({ 'mathtime.account': { name: 'sam' } });
  const queue2 = createQueue(storage2);
  const sent = [];
  const account2 = createAccount({ queue: queue2, storage: storage2, fetch: async (p, init) => { sent.push(JSON.parse(init.body).id); return { status: 201, json: async () => ({}) }; } });
  queue2.add(run('x', 1, 90000));                           // not in the outbox: unknown
  const set2 = storage2.setItem;
  storage2.setItem = (key, value) => {
    if (key === 'mathtime.outbox') throw new Error('QuotaExceededError (test)');
    set2(key, value);
  };
  await account2.keep(run('y', 1, 60000));
  assert.deepEqual(sent, ['y']);
  assert.deepEqual(queue2.runs().map(r => r.id), ['x', 'y']);  // x is slower, but not known stored
});

test('a log in waits for a log out still under way, so its answer cannot end the new session', async () => {
  const order = [];
  let release;
  const held = new Promise(r => { release = r; });
  const storage = memory({ 'mathtime.account': { name: 'sam' } });
  const account = createAccount({
    queue: createQueue(storage), storage,
    fetch: async path => {
      order.push('send ' + path);
      if (path === '/api/logout') { await held; order.push('answer /api/logout'); return { status: 204, json: async () => { throw new SyntaxError('none'); } }; }
      if (path === '/api/login') return { status: 200, json: async () => ({ name: 'sam' }) };
      return { status: 200, json: async () => ({}) };
    },
  });
  account.logout();
  const entering = account.enter('login', { name: 'sam', password: 'password1' });
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(order, ['send /api/logout']);            // the log in waits
  release();
  assert.deepEqual(await entering, { name: 'sam' });
  assert.deepEqual(order.slice(0, 3), ['send /api/logout', 'answer /api/logout', 'send /api/login']);
});

test('the log out resent on load is waited for too', async () => {
  const order = [];
  let release;
  const held = new Promise(r => { release = r; });
  const storage = memory({ 'mathtime.logoutPending': true });
  const account = createAccount({
    queue: createQueue(storage), storage,
    fetch: async path => {
      order.push(path);
      if (path === '/api/logout') { await held; return { status: 204, json: async () => { throw new SyntaxError('none'); } }; }
      if (path === '/api/login') return { status: 200, json: async () => ({ name: 'sam' }) };
      return { status: 401, json: async () => ({}) };
    },
  });
  const checking = account.check();
  const entering = account.enter('login', { name: 'sam', password: 'password1' });
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(order, ['/api/logout']);
  release();
  await entering;
  await checking;
  assert.equal(order[1], '/api/login');
  assert.equal(account.name, 'sam');                        // the late /api/me is ignored
});
