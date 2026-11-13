import { test as base, expect } from '@playwright/test';

// The accounts API (accounts spec §6), faked in the browser for the tests:
// page.route('**/api/**') answers as the real one does, from memory.
// Name "sam", password "password1"; invite "TEST-INVITE" works once.
// `signedIn` is the name the session starts with, or null.
// Every request is logged (`requests`); `answer[path]`, a function of the
// request's body, can answer instead ({status, body}, or 'down' for no
// answer at all), and `down` makes every request fail.
// A record as the API takes it (server/app.mjs cleanRecord()): anything
// else is a 400.
const isCount = v => Number.isSafeInteger(v) && v >= 0;
function validRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(r.id)) return false;
  if (!Number.isSafeInteger(r.level) || r.level < 1 || r.level > 1000) return false;
  if (typeof r.finishedAt !== 'string' || r.finishedAt.length > 40 || Number.isNaN(Date.parse(r.finishedAt))) return false;
  if (!isCount(r.totalMs) || !isCount(r.misses)) return false;
  if (!Array.isArray(r.problems) || r.problems.length < 1 || r.problems.length > 200) return false;
  return r.problems.every(p => p && typeof p === 'object' && Number.isSafeInteger(p.a) && Number.isSafeInteger(p.b) && isCount(p.ms) && isCount(p.misses));
}

export function fakeApi({ signedIn = null } = {}) {
  const api = {
    users: new Map([['sam', { name: 'sam', password: 'password1' }]]),
    invites: new Set(['TEST-INVITE']),
    session: signedIn,
    stored: new Map(),                       // account name → Map(id → record), the runs stored
    requests: [],
    answer: {},
    down: false,
  };
  // The runs stored for `name` (a Map, made on first use).
  api.runs = name => {
    if (!api.stored.has(name)) api.stored.set(name, new Map());
    return api.stored.get(name);
  };
  const json = (status, body) => ({ status, body });
  function respond(method, path, body) {
    const user = api.session ? api.users.get(api.session.toLowerCase()) : null;
    if (path === '/api/me' && method === 'GET') return user ? json(200, { name: user.name }) : json(401, { error: 'session' });
    if (path === '/api/login' && method === 'POST') {
      const found = api.users.get(String(body?.name ?? '').toLowerCase());
      if (!found || found.password !== body?.password) return json(401, { error: 'mismatch' });
      api.session = found.name;
      return json(200, { name: found.name });
    }
    if (path === '/api/signup' && method === 'POST') {
      const name = String(body?.name ?? '');
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(name)) return json(400, { error: 'name' });
      if (String(body?.password ?? '').length < 8) return json(400, { error: 'password' });
      if (!api.invites.has(String(body?.invite ?? '').toUpperCase())) return json(403, { error: 'invite' });
      if (api.users.has(name.toLowerCase())) return json(409, { error: 'taken' });
      api.invites.delete(String(body.invite).toUpperCase());
      api.users.set(name.toLowerCase(), { name, password: body.password });
      api.session = name;
      return json(201, { name });
    }
    if (path === '/api/logout' && method === 'POST') {
      api.session = null;
      return { status: 204 };
    }
    if (path === '/api/runs' && method === 'POST') {
      if (!user) return json(401, { error: 'session' });
      if (!validRecord(body)) return json(400, { error: 'record' });
      const runs = api.runs(user.name);
      if (runs.has(body.id)) return json(200, { id: body.id });
      runs.set(body.id, body);
      return json(201, { id: body.id });
    }
    if (path === '/api/best' && method === 'GET') {
      if (!user) return json(401, { error: 'session' });
      const best = {};
      for (const r of api.runs(user.name).values()) if (!(best[r.level] <= r.totalMs)) best[r.level] = r.totalMs;
      return json(200, best);
    }
    return json(404, { error: 'not found' });
  }
  api.attach = target => target.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch {}
    api.requests.push({ method: req.method(), path, body, headers: req.headers() });
    let out = api.answer[path] ? api.answer[path](body) : undefined;
    if (out === undefined) out = api.down ? 'down' : respond(req.method(), path, body);
    if (out === 'down') return route.abort('failed');
    await route.fulfill({
      status: out.status,
      contentType: 'application/json',
      body: out.body === undefined ? '' : JSON.stringify(out.body),
    });
  });
  return api;
}

// Signed in as `name`: the API's session, and the name cached as the page
// would have it, so no lock shows even before /api/me answers.
export async function withAccount(context, name = 'sam') {
  const api = fakeApi({ signedIn: name });
  await api.attach(context);
  if (name) {
    await context.addInitScript(n => {
      try {
        if (localStorage.getItem('mathtime.account') === null) localStorage.setItem('mathtime.account', JSON.stringify({ name: n }));
      } catch {}
    }, name);
  }
  return api;
}

// Every test's page talks to the fake API. The tests from before accounts
// play every level, so they are signed in as "sam" unless a test says
// otherwise: test.use({ account: null }) is signed out.
export const test = base.extend({
  account: ['sam', { option: true }],
  api: [async ({ context, account }, use) => {
    await use(await withAccount(context, account));
  }, { auto: true }],
});

export { expect };
