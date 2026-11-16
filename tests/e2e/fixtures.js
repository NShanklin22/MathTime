import { test as base, expect } from '@playwright/test';

// The accounts API (accounts spec §6), faked in the browser for the tests:
// page.route('**/api/**') answers as the real one does, from memory.
// Name "sam", password "password1"; invite "TEST-INVITE" works once.
// `signedIn` is the name the session starts with, or null.
// Every request is logged (`requests`); `answer[path]`, a function of the
// request's body, can answer instead ({status, body}, or 'down' for no
// answer at all), and `down` makes every request fail. `now()` is the
// server's clock, for the daily challenge's dates (a test sets its day).
// Each upload says whose it is (`name`); another account's is a 403.
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

// A daily try's record as the API takes it (server/app.mjs cleanDaily()):
// a run's, with no level, 1-20 problems, daily: true and out; finished,
// a time and reached 20 (or none); out, reached 1-20 and no time.
function validDaily(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(r.id)) return false;
  if (typeof r.finishedAt !== 'string' || r.finishedAt.length > 40 || Number.isNaN(Date.parse(r.finishedAt))) return false;
  if (!isCount(r.misses)) return false;
  if (!Array.isArray(r.problems) || r.problems.length < 1 || r.problems.length > 20) return false;
  if (!r.problems.every(p => p && typeof p === 'object' && Number.isSafeInteger(p.a) && Number.isSafeInteger(p.b) && isCount(p.ms) && isCount(p.misses))) return false;
  if (r.daily !== true || typeof r.out !== 'boolean') return false;
  if (r.out) return Number.isSafeInteger(r.reached) && r.reached >= 1 && r.reached <= 20 && (r.totalMs === undefined || r.totalMs === null);
  return isCount(r.totalMs) && (r.reached === undefined || r.reached === 20);
}

export function fakeApi({ signedIn = null } = {}) {
  const api = {
    users: new Map([['sam', { name: 'sam', password: 'password1' }]]),
    invites: new Set(['TEST-INVITE']),
    session: signedIn,
    stored: new Map(),                       // account name → Map(id → record), the runs stored
    daily: new Map(),                        // date → [{name, totalMs, reached, id}], in the order stored
    now: () => Date.now(),
    requests: [],
    answer: {},
    down: false,
  };
  // The runs stored for `name` (a Map, made on first use).
  api.runs = name => {
    if (!api.stored.has(name)) api.stored.set(name, new Map());
    return api.stored.get(name);
  };
  // Put others' scores on `date`'s board: [{name, totalMs}] or
  // [{name, reached}] (an out).
  api.seedDaily = (date, scores) => {
    if (!api.daily.has(date)) api.daily.set(date, []);
    for (const { name, totalMs = null, reached = 20 } of scores) api.daily.get(date).push({ name, totalMs, reached, id: `seed-${name}` });
  };
  // The board as GET /api/daily/:date gives it: times first, fastest
  // first, then outs by how far they got; ties share a place, and keep the
  // order they were stored in.
  // The board as the API gives it: its first 200 rows, and yours after
  // them at its real place if you are further down; total, how many are on it.
  api.board = (date, me) => {
    const all = (api.daily.get(date) ?? []).map((e, i) => ({ ...e, i }));
    all.sort((x, y) => (x.totalMs === null) - (y.totalMs === null)
      || (x.totalMs === null ? y.reached - x.reached : x.totalMs - y.totalMs) || x.i - y.i);
    let place = 0, prev = null;
    return all.map((e, i) => {
      const score = e.totalMs === null ? `out:${e.reached}` : `t:${e.totalMs}`;
      if (score !== prev) place = i + 1;
      prev = score;
      return { place, name: e.name, totalMs: e.totalMs, reached: e.reached, you: !!me && e.name.toLowerCase() === me.toLowerCase() };
    });
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
    // Whose an upload is: another account's than the session's is refused.
    const owner = name => typeof name === 'string' && name.toLowerCase() === user.name.toLowerCase();
    if (path === '/api/runs' && method === 'POST') {
      if (!user) return json(401, { error: 'session' });
      if (!owner(body?.name)) return json(403, { error: 'owner' });
      const { name: _, ...record } = body;
      if (!validRecord(record)) return json(400, { error: 'record' });
      const runs = api.runs(user.name);
      if (runs.has(record.id)) return json(200, { id: record.id });
      runs.set(record.id, record);
      return json(201, { id: body.id });
    }
    if (path === '/api/best' && method === 'GET') {
      if (!user) return json(401, { error: 'session' });
      const best = {};
      for (const r of api.runs(user.name).values()) if (!(best[r.level] <= r.totalMs)) best[r.level] = r.totalMs;
      return json(200, best);
    }
    if (path === '/api/daily' && method === 'POST') {
      if (!user) return json(401, { error: 'session' });
      if (!owner(body?.name)) return json(403, { error: 'owner' });
      // The player's own date, a day either side of the server's at most.
      const dayNo = typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? Date.parse(`${body.date}T00:00:00Z`) / 86_400_000 : NaN;
      if (!(Math.abs(dayNo - Math.floor(api.now() / 86_400_000)) <= 1)) return json(400, { error: 'date' });
      if (!validDaily(body.record)) return json(400, { error: 'record' });
      if (!api.daily.has(body.date)) api.daily.set(body.date, []);
      const day = api.daily.get(body.date);
      const had = day.find(e => e.name === user.name);
      if (had) return had.id === body.record.id ? json(200, { date: body.date }) : json(409, { error: 'taken' });
      const { out, totalMs, reached } = body.record;
      day.push({ name: user.name, totalMs: out ? null : totalMs, reached: out ? reached : 20, id: body.record.id, record: body.record });
      return json(201, { date: body.date });
    }
    const dated = /^\/api\/daily\/([^/]+)$/.exec(path);
    if (dated && method === 'GET') {
      const date = dated[1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return json(400, { error: 'date' });
      const all = api.board(date, user?.name);
      const rows = all.slice(0, 200);
      const you = all.findIndex(r => r.you);
      if (you >= 200) rows.push(all[you]);
      return json(200, { date, total: all.length, rows });
    }
    return json(404, { error: 'not found' });
  }
  api.attach = target => target.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch {}
    api.requests.push({ method: req.method(), path, body, headers: req.headers() });
    let out = api.answer[path] ? api.answer[path](body, req.method()) : undefined;
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
