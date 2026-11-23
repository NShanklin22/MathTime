// The MathTime API (accounts spec §6, runs spec §6): accounts, sessions, runs and best times.
// createApp returns a node:http request handler; server.mjs listens with it, the tests too.
import { hashPassword, verifyPassword, DUMMY_HASH, newToken, hashToken } from './auth.mjs';
import * as store from './store.mjs';
import { SHOWN, NO_CROWD, crowdSize, crowdFor, crowdBetter, crowdTop, compareScores } from './crowd.mjs';

export const COOKIE = 'mt_session';
export const BODY_LIMIT = 64 * 1024;
// Two limits, each 10 a minute, in memory. An address is an IPv4 address or an IPv6 /64.
// - Per address, every log-in and sign-up try: one caller can't guess faster than 10 a minute in all,
//   whatever names or codes it tries.
// - Per name and address, failed log-ins only. Keyed by address too, so failures from elsewhere never
//   lock Sam out from Sam's own address. While both limits are 10 the address limit is reached first;
//   this one matters if the address limit is raised (a school behind one address), so that one address
//   still gets only 10 wrong passwords a minute on each name.
// Neither stops guessing spread over many addresses: about 10 a minute for each address the guesser has.
export const RATE_LIMIT = 10;
// Reading a daily board is cheap and needs no session: a loose limit, per address, only against floods.
// 300, so a class behind one school address doesn't reach it.
export const BOARD_RATE_LIMIT = 300;
// Open sign-up (open sign-up spec §1): an address makes at most 5 accounts an hour. Only accounts made
// count, so a typo or a taken name costs nothing; tries are still under the 10 a minute above.
export const SIGNUP_HOUR_LIMIT = 5;
const RATE_WINDOW = 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NAME = /^[A-Za-z0-9_-]{3,20}$/;
const MIN_PASSWORD = 8;
const MAX_AGE = store.SESSION_LIFE / 1000;

class HttpError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

// Hits per key in the last window (a minute unless given), in memory: a restart forgets them, which is
// fine at this size.
function rateLimiter(now, window = RATE_WINDOW) {
  const hits = new Map();   // key -> times of the hits in the window, oldest first
  let lastSweep = 0;
  function recent(key) {
    const t = now();
    if (t - lastSweep > window) {
      for (const [k, times] of hits) if (!times.length || times.at(-1) <= t - window) hits.delete(k);
      lastSweep = t;
    }
    const times = (hits.get(key) || []).filter((when) => when > t - window);
    hits.set(key, times);
    return times;
  }
  return {
    full: (key, max = RATE_LIMIT) => recent(key).length >= max,
    hit: (key) => recent(key).push(now()),
  };
}

// The address a rate limit counts against. IPv6 by its /64, the block one home or phone usually has,
// so one caller can't step through its own addresses. An IPv4 address mapped into IPv6 counts as IPv4.
export function addressKey(address) {
  const addr = String(address || '').trim().split('%')[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  if (mapped) return mapped[1];
  if (!addr.includes(':')) return addr;
  const [head, tail] = addr.split('::');
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const groups = tail === undefined
    ? front
    : [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill('0'), ...back];
  return `${groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':')}::/64`;
}

/* ---------- Records ---------- */

const isCount = (v) => Number.isSafeInteger(v) && v >= 0;
const isInt = (v) => Number.isSafeInteger(v);

// The fields every record has (id, finishedAt, misses, problems), checked; null when malformed.
function cleanCommon(r, maxProblems) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const { id, finishedAt, misses, problems } = r;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  if (typeof finishedAt !== 'string' || finishedAt.length > 40 || Number.isNaN(Date.parse(finishedAt))) return null;
  if (!isCount(misses)) return null;
  if (!Array.isArray(problems) || problems.length < 1 || problems.length > maxProblems) return null;
  const clean = [];
  for (const p of problems) {
    if (!p || typeof p !== 'object') return null;
    if (!isInt(p.a) || !isInt(p.b) || !isCount(p.ms) || !isCount(p.misses)) return null;
    clean.push({ a: p.a, b: p.b, ms: p.ms, misses: p.misses });
  }
  return { id, finishedAt, misses, problems: clean };
}

// The record as buildRecord (src/record.js) makes it, keeping only its fields; null when malformed.
export function cleanRecord(r) {
  const common = cleanCommon(r, 200);
  if (!common) return null;
  const { level, totalMs } = r;
  if (!Number.isSafeInteger(level) || level < 1 || level > 1000) return null;
  if (!isCount(totalMs)) return null;
  const { id, finishedAt, misses, problems } = common;
  return { id, level, finishedAt, totalMs, misses, problems };
}

export const DAILY_QUESTIONS = 20;

// A daily try's record (daily spec §2): a run's record with daily: true, out, and reached, the question
// it ended on. Finished: all 20 problems, a totalMs over 0, and reached is 20 (it may be left out).
// Out: no time, and reached is its number of problems, 1-20, the last being the one it ended on.
// Its problems come from Levels 1-4, so it has no level. Null when malformed.
export function cleanDaily(r) {
  const common = cleanCommon(r, DAILY_QUESTIONS);
  if (!common) return null;
  const { daily, out, totalMs } = r;
  let { reached } = r;
  if (daily !== true || typeof out !== 'boolean') return null;
  if (out) {
    if (reached !== common.problems.length) return null;
    if (totalMs !== undefined && totalMs !== null) return null;
  } else {
    if (common.problems.length !== DAILY_QUESTIONS) return null;
    if (!isCount(totalMs) || totalMs === 0) return null;
    if (reached === undefined) reached = DAILY_QUESTIONS;
    if (reached !== DAILY_QUESTIONS) return null;
  }
  const { id, finishedAt, misses, problems } = common;
  return { id, daily: true, out, reached, finishedAt, totalMs: out ? null : totalMs, misses, problems };
}

/* ---------- Dates ---------- */

// Days since 1970-01-01 for a real YYYY-MM-DD date, else null.
export function dayNumber(date) {
  const m = typeof date === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / store.DAY;
}

/* ---------- The handler ---------- */

// trustProxy: take the caller's address from X-Real-IP, which only nginx (or scripts/serve.mjs) sets.
// Without it, the socket's address, so a caller can't name a new address for each try.
// addressLimit: tries a minute per address (default RATE_LIMIT); the tests raise it to reach the name limit.
// openSignup: sign-up with no code makes an account; false (OPEN_SIGNUP=0) asks for an invite again.
export function createApp({ db, now = Date.now, cookieSecure = true, trustProxy = false, addressLimit = RATE_LIMIT, crowd = true,
  openSignup = true }) {
  const limits = rateLimiter(now);
  const hourly = rateLimiter(now, HOUR);

  // Expired sessions go when the app starts, then once a day, on the first request after.
  let sweptAt = now();
  store.sweepSessions(db, sweptAt);
  function sweep() {
    const t = now();
    if (t - sweptAt < store.DAY) return;
    store.sweepSessions(db, t);
    sweptAt = t;
  }

  function cookie(token) {
    const attrs = token
      ? [`${COOKIE}=${token}`, `Max-Age=${MAX_AGE}`]
      : [`${COOKIE}=`, 'Max-Age=0'];
    attrs.push('Path=/api', 'HttpOnly');
    if (cookieSecure) attrs.push('Secure');
    attrs.push('SameSite=Strict');
    return attrs.join('; ');
  }

  function readToken(req) {
    for (const part of String(req.headers.cookie || '').split(';')) {
      const [key, ...rest] = part.trim().split('=');
      const value = rest.join('=');
      if (key === COOKIE && /^[A-Za-z0-9_-]{43}$/.test(value)) return value;
    }
    return null;
  }

  // The signed-in account, renewing the session (and its cookie) at most once a day; else 401.
  function requireUser(req, res) {
    const token = readToken(req);
    const t = now();
    const session = token && store.findSession(db, hashToken(token), t);
    const user = session && store.userById(db, session.user_id);
    if (!user) throw new HttpError(401, { error: 'session' });
    if (t - session.renewed_at >= store.DAY) {
      store.renewSession(db, session.token_hash, t);
      res.setHeader('Set-Cookie', cookie(token));
    }
    return user;
  }

  // The signed-in account's id, or null: for a route anyone may call. It never renews the session.
  function optionalUserId(req) {
    const token = readToken(req);
    const session = token && store.findSession(db, hashToken(token), now());
    return session ? session.user_id : null;
  }

  // A run or try may name the account the browser ended it under. When that isn't this session's
  // account (another tab logged in as someone else meanwhile), 403, so it is never stored for them.
  function checkOwner(user, body) {
    const name = body && typeof body === 'object' && !Array.isArray(body) ? body.name : undefined;
    if (name === undefined) return;
    if (typeof name !== 'string' || name.toLowerCase() !== user.name_lc) throw new HttpError(403, { error: 'owner' });
  }

  function startSession(res, userId) {
    const token = newToken();
    store.createSession(db, { tokenHash: hashToken(token), userId, now: now() });
    res.setHeader('Set-Cookie', cookie(token));
  }

  const callerOf = (req) => addressKey((trustProxy && req.headers['x-real-ip']) || req.socket.remoteAddress);

  // Every log-in or sign-up try counts against the caller's address.
  function limitAddress(req) {
    const key = `ip:${callerOf(req)}`;
    if (limits.full(key, addressLimit)) throw new HttpError(429, { error: 'rate' });
    limits.hit(key);
  }
  // Failed log-ins count against this name from this address only.
  const nameKey = (req, name) => `name:${name.toLowerCase().slice(0, 64)}@${callerOf(req)}`;

  const routes = {
    'POST /api/signup': async (req, res, body) => {
      const { invite, name, password, website } = body ?? {};
      limitAddress(req);
      // The honeypot: a field people can't see or tab to, so only a bot fills it. It gets the answer a
      // bad name gets, which tells it nothing.
      if (website) throw new HttpError(400, { error: 'name' });
      if (typeof name !== 'string' || !NAME.test(name)) throw new HttpError(400, { error: 'name' });
      if (typeof password !== 'string' || [...password].length < MIN_PASSWORD) {
        throw new HttpError(400, { error: 'password' });
      }
      // No code, or an empty one: an open sign-up, which makes a new account.
      const open = typeof invite !== 'string' || !invite.trim();
      if (open && !openSignup) throw new HttpError(403, { error: 'invite' });
      const hourKey = `signup:${callerOf(req)}`;
      // What the code allows: a new account, or a new password for the account it was made for.
      // Checked before the slow hash, so a wrong code costs nothing, and again in the transaction,
      // since another request may have used the code (or the name, or the hour's last account) meanwhile.
      const check = () => {
        if (open) {
          if (hourly.full(hourKey, SIGNUP_HOUR_LIMIT)) throw new HttpError(429, { error: 'rate' });
          if (store.findUser(db, name)) throw new HttpError(409, { error: 'taken' });
          return {};
        }
        const code = store.usableCode(db, invite, now());
        if (!code) throw new HttpError(403, { error: 'invite' });
        if (code.user_id !== null) {
          const target = store.userById(db, code.user_id);
          if (!target || target.name_lc !== name.toLowerCase()) throw new HttpError(403, { error: 'invite' });
          return { code, target };
        }
        if (store.findUser(db, name)) throw new HttpError(409, { error: 'taken' });
        return { code };
      };
      check();
      const pwHash = await hashPassword(password);
      const user = store.transaction(db, () => {
        const t = now();
        const { code, target } = check();
        if (open) {
          // Counted here, with no wait since the check above, so two at once can't both take the last one.
          hourly.hit(hourKey);
          return { id: store.createUser(db, { name, pwHash, now: t }), name };
        }
        store.useCode(db, code.code, t);
        if (target) {
          store.setPassword(db, target.id, pwHash);   // which also ends its other sessions
          return target;
        }
        return { id: store.createUser(db, { name, pwHash, now: t }), name };
      });
      startSession(res, user.id);
      return [201, { name: user.name }];
    },

    'POST /api/login': async (req, res, body) => {
      const { name, password } = body ?? {};
      limitAddress(req);
      const key = typeof name === 'string' && name ? nameKey(req, name) : null;
      if (key && limits.full(key)) throw new HttpError(429, { error: 'rate' });
      const user = store.findUser(db, name);
      const ok = await verifyPassword(typeof password === 'string' ? password : '', user ? user.pw_hash : DUMMY_HASH);
      if (!user || !ok) {
        if (key) limits.hit(key);
        throw new HttpError(401, { error: 'mismatch' });
      }
      startSession(res, user.id);
      return [200, { name: user.name }];
    },

    'POST /api/logout': async (req, res) => {
      const token = readToken(req);
      if (token) store.deleteSession(db, hashToken(token));
      res.setHeader('Set-Cookie', cookie(null));
      return [204];
    },

    'GET /api/me': async (req, res) => {
      const user = requireUser(req, res);
      return [200, { name: user.name }];
    },

    'POST /api/runs': async (req, res, body) => {
      const user = requireUser(req, res);
      checkOwner(user, body);
      const record = cleanRecord(body);
      if (!record) throw new HttpError(400, { error: 'record' });
      return store.addRun(db, user.id, record, now()) ? [201, { id: record.id }] : [200, { id: record.id }];
    },

    'GET /api/best': async (req, res) => {
      const user = requireUser(req, res);
      return [200, store.bestTimes(db, user.id)];
    },

    // The day is the player's own date (daily spec §1), anywhere from UTC-12 to UTC+14, so it may be
    // the day before or after the server's UTC date, never further.
    'POST /api/daily': async (req, res, body) => {
      const user = requireUser(req, res);
      checkOwner(user, body);
      const { date, record: sent } = body ?? {};
      const day = dayNumber(date);
      if (day === null || Math.abs(day - Math.floor(now() / store.DAY)) > 1) throw new HttpError(400, { error: 'date' });
      const record = cleanDaily(sent);
      if (!record) throw new HttpError(400, { error: 'record' });
      const outcome = store.addDaily(db, user.id, date, record, now());
      if (outcome === 'taken') throw new HttpError(409, { error: 'taken' });
      return [outcome === 'stored' ? 201 : 200, { date }];
    },

    // The date's board, for anyone. Finishers share a place on equal times, outs on equal questions reached.
    'GET /api/daily/:date': async (req, res, body, { date }) => {
      const key = `board:${callerOf(req)}`;
      if (limits.full(key, BOARD_RATE_LIMIT)) throw new HttpError(429, { error: 'rate' });
      limits.hit(key);
      if (dayNumber(date) === null) throw new HttpError(400, { error: 'date' });
      const me = optionalUserId(req);
      const row = (r, place) =>
        ({ place, name: r.name, totalMs: r.out ? null : r.total_ms, reached: r.reached, you: me !== null && r.user_id === me });
      // The crowd (crowd spec): 10,000 made-up players and 100 more an account, all counted in the
      // places, the best ten shown. None on a date no one can have played yet, past tomorrow on the
      // server's clock.
      const playable = dayNumber(date) <= Math.floor(now() / store.DAY) + 1;
      const taken = crowd && playable ? store.userNamesLc(db) : null;
      const many = taken ? crowdFor(date, crowdSize(taken.size)) : NO_CROWD;
      const real = store.dailyBoard(db, date);
      // A stable sort with the real scores first, so a real player goes above a made-up one on a tie.
      const board = [...real, ...(taken ? crowdTop(many, taken) : [])].sort(compareScores)
        .slice(0, taken ? SHOWN : store.BOARD_ROWS);
      // A place: 1 + everyone strictly better. The real scores better than one shown are all in `real`.
      const better = (r) => real.filter((x) => compareScores(x, r) < 0).length;
      const rows = board.map((r) => row(r, 1 + crowdBetter(many, r) + better(r)));
      // Past the rows shown, the caller's own score still shows, last, with its real place.
      if (me !== null && !rows.some((r) => r.you)) {
        const mine = store.dailyScore(db, date, me);
        if (mine) rows.push(row(mine, crowdBetter(many, mine) + store.dailyPlace(db, date, mine)));
      }
      return [200, { date, total: store.dailyCount(db, date) + many.size, rows }];
    },

    'GET /api/healthz': async () => {
      db.prepare('SELECT 1').get();
      return [200, 'ok'];
    },
  };
  const paths = new Set(Object.keys(routes).map((key) => key.split(' ')[1]));

  async function handle(req, res) {
    sweep();
    let path = new URL(req.url, 'http://api').pathname;
    const params = {};
    const dated = /^\/api\/daily\/([^/]+)$/.exec(path);
    if (dated) {
      path = '/api/daily/:date';
      try { params.date = decodeURIComponent(dated[1]); } catch { params.date = null; }
    }
    const route = routes[`${req.method} ${path}`] || (req.method === 'HEAD' && routes[`GET ${path}`]);
    if (!route) {
      if (paths.has(path)) {
        const methods = Object.keys(routes).filter((key) => key.endsWith(` ${path}`)).map((key) => key.split(' ')[0]);
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, { error: 'method' });
      }
      throw new HttpError(404, { error: 'not found' });
    }
    const body = req.method === 'POST' ? await readBody(req) : undefined;
    return route(req, res, body, params);
  }

  return async function handler(req, res) {
    let status, body;
    try {
      [status, body] = await handle(req, res);
    } catch (err) {
      if (!(err instanceof HttpError)) {
        console.error(err);
        err = new HttpError(500, { error: 'server' });
      }
      [status, body] = [err.status, err.body];
      if (status === 413) res.setHeader('Connection', 'close');
      if (body.error === 'session' && readToken(req)) {
        res.setHeader('Set-Cookie', cookie(null));   // a dead session: drop the cookie
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    if (body === undefined) {
      res.writeHead(status).end();
    } else if (typeof body === 'string') {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(req.method === 'HEAD' ? undefined : body);
    } else {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
    }
  };
}

// The POST's JSON body (undefined when it has none). 415 unless it's JSON, 413 over 64KB, 400 unparseable.
async function readBody(req) {
  const length = req.headers['content-length'];
  const hasBody = (length !== undefined && length !== '0') || req.headers['transfer-encoding'] !== undefined;
  if (!hasBody) return undefined;
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') {
    req.resume();
    throw new HttpError(415, { error: 'type' });
  }
  if (Number(length) > BODY_LIMIT) {
    req.resume();
    throw new HttpError(413, { error: 'size' });
  }
  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const onData = (chunk) => {
      size += chunk.length;
      if (size <= BODY_LIMIT) return chunks.push(chunk);
      // Stop keeping it, but let it drain, so the 413 still reaches the client.
      req.off('data', onData).resume();
      reject(new HttpError(413, { error: 'size' }));
    };
    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, { error: 'json' });
  }
}
