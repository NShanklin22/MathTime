// The account (accounts spec §1, §5): who is signed in, the API's calls,
// and the upload of finished runs to the account (runs spec §6's queue).
// No DOM here: storage and fetch are passed in, so the tests can fake them.
//
// What this browser keeps, beside the runs themselves (queue.js,
// mathtime.runs, where signed out the bests come from, as they always have):
// - mathtime.account: {name} while signed in, null once signed out. The
//   page shows it until GET /api/me answers, so the locks never flash.
// - mathtime.outbox: the runs waiting to go up, oldest first, each as
//   {id, name}: the account it was finished in, or null if it was finished
//   signed out. A run goes up only to its own account; one finished signed
//   out, to the account signed in here next, once. It leaves the outbox
//   when the API stores it (200 or 201), or refuses it (400).
// - mathtime.best: {name, best: {n: ms}}, the account's bests, from GET
//   /api/best and each run stored since, kept for offline use.
// - mathtime.logoutPending: a log out the server hasn't confirmed. Until it
//   has, this browser is signed out, whatever /api/me says.
//
// A run the API has stored is dropped from mathtime.runs, unless it is its
// level's fastest here (the signed-out best), so storage never fills up.
// If it is full all the same, a run is kept in memory and still goes up.

const ACCOUNT = 'mathtime.account';
const OUTBOX = 'mathtime.outbox';
const BEST = 'mathtime.best';
const LOGOUT = 'mathtime.logoutPending';

// A name as the API takes it (accounts spec §1), and a password's least length.
export const NAME = /^[A-Za-z0-9_-]{3,20}$/;
export const PASSWORD_MIN = 8;

// What each error says, in words, under the button (accounts spec §3).
export const ERRORS = {
  mismatch: "That name and password don't match",
  invite: "That invite code isn't valid or has been used",
  taken: 'That name is taken',
  offline: "Can't reach the server: try again",
  // '_ or -' kept on one line (no-break spaces), where it wraps at 320px.
  name: 'A name is 3–20 letters, digits, _\u00a0or\u00a0-',
  password: 'A password is 8 or more characters',
  rate: 'Too many tries: wait a minute',
};

// The error, if any, that stops a sign-up being sent: the API would refuse
// it the same way. A password's length is in characters (code points), as
// the API counts it.
export function checkSignup({ name, password }) {
  if (!NAME.test(name.trim())) return 'name';
  if ([...password].length < PASSWORD_MIN) return 'password';
  return null;
}

// What an answer to log in or sign up means: {name} when it worked, or
// {error} with one of ERRORS' keys. Any answer it doesn't expect is the
// server not being reached.
export function loginResult(status, body) {
  if ((status === 200 || status === 201) && typeof body?.name === 'string') return { name: body.name };
  if (status === 429) return { error: 'rate' };
  if (status === 401) return { error: 'mismatch' };
  const error = body?.error;
  if ((status === 400 || status === 403 || status === 409) && error in ERRORS) return { error };
  return { error: 'offline' };
}

// The fastest time of level `n` from what the account knows: `cached`, the
// last bests the API gave ({n: ms}), and `waiting`, the runs not yet
// stored. null if neither has one.
export function mergedBest(n, cached, waiting) {
  const times = waiting.filter(r => r?.level === n && Number.isFinite(r.totalMs)).map(r => r.totalMs);
  const known = cached?.[n];
  if (Number.isFinite(known)) times.push(known);
  return times.length ? Math.min(...times) : null;
}

// Each level's fastest time in `runs`, as {n: ms}.
export function fastest(runs) {
  const best = {};
  for (const r of runs) if (Number.isFinite(r?.totalMs) && !(best[r.level] <= r.totalMs)) best[r.level] = r.totalMs;
  return best;
}

// The runs worth keeping in the browser: those still waiting to go up
// (ids in `waiting`), and each level's fastest (the first of equals), which
// the signed-out bests need. The rest are stored by the API already.
export function pruneRuns(runs, waiting) {
  const first = new Map();
  for (const r of runs) {
    if (!Number.isFinite(r?.totalMs)) continue;
    const held = first.get(r.level);
    if (!held || r.totalMs < held.totalMs) first.set(r.level, r);
  }
  const keep = new Set(first.values());
  return runs.filter(r => keep.has(r) || waiting.has(r?.id));
}

// The outbox as stored: {id, name} entries; anything else is skipped.
export function outboxEntries(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(e => typeof e?.id === 'string' && (e.name === null || typeof e.name === 'string'));
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// `queue` is the runs kept (queue.js): its add(), runs(), replace().
export function createAccount({ queue, storage = browserStorage(), fetch = (...a) => globalThis.fetch(...a) } = {}) {
  const read = (key, fallback) => {
    try {
      const value = JSON.parse(storage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };
  // Whether it was written: storage can be full or blocked.
  const write = (key, value) => {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const remove = key => {
    try { storage.removeItem(key); } catch {}
  };
  const outbox = () => outboxEntries(read(OUTBOX, []));

  // Runs that couldn't be written (storage full): kept here for this page's
  // life, and sent as the outbox's are. {record, name}.
  const memory = [];
  // Once an outbox write has failed, the outbox no longer says which runs
  // still wait, so for the rest of the page's life prune() drops only runs
  // known to be stored: those the API took from this page.
  let outboxLost = false;
  const storedHere = new Set();

  // The first load with accounts: the runs kept before (main's
  // mathtime.runs) were all finished signed out, and go up once to the
  // account signed in here next. If the outbox can't be written, they go up
  // from memory instead, this time.
  (() => {
    let stored;
    try { stored = storage.getItem(OUTBOX); } catch { return; }
    if (stored !== null) return;
    const runs = queue.runs().filter(r => typeof r?.id === 'string');
    if (write(OUTBOX, runs.map(r => ({ id: r.id, name: null })))) return;
    outboxLost = true;
    for (const record of runs) memory.push({ record, name: null });
  })();

  // The name signed in, as the last answer gave it, or null. A log out not
  // yet confirmed is signed out.
  let name = (() => {
    if (read(LOGOUT, false)) return null;
    const cached = read(ACCOUNT, null);
    return typeof cached?.name === 'string' ? cached.name : null;
  })();
  // Bumped on each log in and log out: an answer to a request made before
  // it is out of date, and changes nothing.
  let gen = 0;
  const listeners = new Set();
  const changed = () => { for (const f of listeners) f(name); };
  function setName(next) {
    const was = name;
    name = next;
    write(ACCOUNT, next ? { name: next } : null);
    if (!next) remove(BEST);
    if (was !== next) changed();
  }

  // A request to the API, same-origin with the session's cookie. Resolves
  // to {status, body}; rejects only when the server can't be reached.
  async function call(method, path, data) {
    const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (data !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(data);
    }
    const res = await fetch(path, init);
    let body = null;
    try {
      body = await res.json();
    } catch {}
    return { status: res.status, body };
  }

  // ---------- Signing in and out ----------

  // Ask the API who is signed in. 200: that name; 401: no one. Anything
  // else, or no answer, leaves the state as it was (the cached one). A log
  // out not yet confirmed is sent again first, and until it goes through
  // this browser stays signed out. Signed in, the runs waiting go up and
  // the bests are fetched.
  async function check() {
    const g = gen;
    if (read(LOGOUT, false)) {
      const out = await sendLogout();
      if (g !== gen) return name;
      if (!out) {
        setName(null);
        return name;
      }
    }
    let answer;
    try {
      answer = await call('GET', '/api/me');
    } catch {
      return name;
    }
    if (g !== gen) return name;
    if (answer.status === 200 && typeof answer.body?.name === 'string') {
      setName(answer.body.name);
      await signedIn();
    } else if (answer.status === 401) {
      setName(null);
    }
    return name;
  }

  // The runs go up first, then the bests are asked for, so the answer has
  // them all.
  async function signedIn() {
    await flush();
    await refreshBest();
  }

  // Log in or sign up (`mode`), with what was typed. Resolves to {name} or
  // {error} (loginResult()), or {stale: true} if a log out came first.
  // Once in, the runs go up without waiting.
  async function enter(mode, { invite = '', name: typed, password }) {
    const g = ++gen;
    const data = mode === 'signup' ? { invite: invite.trim(), name: typed.trim(), password } : { name: typed.trim(), password };
    // A log out still under way first: its answer would clear the new
    // session's cookie.
    await loggingOut;
    if (g !== gen) return { stale: true };
    let result;
    try {
      const { status, body } = await call('POST', mode === 'signup' ? '/api/signup' : '/api/login', data);
      result = loginResult(status, body);
    } catch {
      result = { error: 'offline' };
    }
    if (g !== gen) return { stale: true };
    if (result.name) {
      remove(LOGOUT);                        // a new session: the old one no longer matters
      setName(result.name);
      done = signedIn();
    }
    return result;
  }
  let done = Promise.resolve();

  // Log out: signed out here at once, and kept so until the server says
  // the session is over (sent again on the next load if it can't be now).
  // The runs stay; the ones waiting stay waiting, each for its account.
  function logout() {
    gen++;
    write(LOGOUT, true);
    setName(null);
    return sendLogout();
  }
  // The request, tracked while it is under way (loggingOut), so a log in
  // waits for it.
  let loggingOut = Promise.resolve();
  function sendLogout() {
    const going = (async () => {
      try {
        const { status } = await call('POST', '/api/logout');
        if ((status >= 200 && status < 300) || status === 401) {
          remove(LOGOUT);
          return true;
        }
      } catch {}
      return false;
    })();
    loggingOut = going.then(() => {}, () => {});
    return going;
  }

  // ---------- The upload ----------

  // Keep a run just finished: in the browser's runs and the outbox, as the
  // account signed in now (or none). If storage is full, the runs the API
  // has are dropped and it tries again; failing that, it is kept in memory.
  // Signed in, it goes up at once.
  function keep(record) {
    const entry = { id: record.id, name };
    let kept = queue.add(record);
    if (!kept) {
      prune();
      kept = queue.add(record);
    }
    if (!kept || !write(OUTBOX, [...outbox(), entry])) {
      memory.push({ record, name });
      if (kept) outboxLost = true;          // in the runs, but not known to wait
    }
    return name ? flush() : Promise.resolve();
  }

  // Send what waits for this account, oldest first, one at a time: the
  // runs finished in it, and those finished signed out. A run leaves on
  // 200 or 201, its time merged into the account's bests, or on 400 (the
  // API will never take it). 401 means the session is gone: signed out. No
  // answer, or any other, stops until the next load or finish. If the
  // account changes while a run is sent, the answer is ignored and it stops.
  // One send at a time: a call while one is under way runs once more after.
  let sending = null, again = false;
  function flush() {
    if (sending) {
      again = true;
      return sending;
    }
    sending = (async () => {
      do {
        again = false;
        await sendAll();
      } while (again && name);
    })().finally(() => { sending = null; });
    return sending;
  }
  async function sendAll() {
    const who = name, g = gen;
    if (!who) return;
    const mine = owner => owner === null || owner === who;
    const tried = new Set();
    for (;;) {
      if (name !== who || gen !== g) return;
      let item = memory.find(m => mine(m.name) && !tried.has(m.record.id));
      let record = item?.record;
      if (!item) {
        const entry = outbox().find(e => mine(e.name) && !tried.has(e.id));
        if (!entry) break;
        record = queue.runs().find(r => r?.id === entry.id);
        if (!record) {
          dropWaiting(entry.id);
          continue;
        }
      }
      tried.add(record.id);
      let status;
      try {
        ({ status } = await call('POST', '/api/runs', record));
      } catch {
        return;
      }
      if (name !== who || gen !== g) return;
      if (status === 200 || status === 201) {
        storedHere.add(record.id);
        storeBest(who, { [record.level]: record.totalMs });
        dropWaiting(record.id);
      } else if (status === 400) {
        dropWaiting(record.id);
      } else if (status === 401) {
        setName(null);
        return;
      } else {
        return;
      }
    }
    prune();
  }
  function dropWaiting(id) {
    const at = memory.findIndex(m => m.record.id === id);
    if (at >= 0) memory.splice(at, 1);
    const list = outbox();
    if (list.some(e => e.id === id)) write(OUTBOX, list.filter(e => e.id !== id));
  }

  // Drop the runs the API has: all but those waiting and each level's
  // fastest. Once the outbox has failed to be written, every run is taken
  // to be waiting but those the API took from this page.
  function prune() {
    const runs = queue.runs();
    const waiting = outboxLost
      ? new Set(runs.map(r => r?.id).filter(id => !storedHere.has(id)))
      : new Set([...outbox().map(e => e.id), ...memory.map(m => m.record.id)]);
    const kept = pruneRuns(runs, waiting);
    if (kept.length < runs.length) queue.replace(kept);
  }

  // Merge `times` ({n: ms}) into the account's cached bests, the smaller of
  // each level's.
  function storeBest(who, times) {
    const cache = read(BEST, null);
    const best = { ...(cache?.name === who ? cache.best : null) };
    let changes = false;
    for (const [n, ms] of Object.entries(times)) {
      if (Number.isFinite(ms) && !(best[n] <= ms)) {
        best[n] = ms;
        changes = true;
      }
    }
    if (changes || cache?.name !== who) write(BEST, { name: who, best });
    return changes;
  }

  // The account's bests from the API, merged into those kept for offline use.
  async function refreshBest() {
    const asked = name, g = gen;
    if (!asked) return;
    let answer;
    try {
      answer = await call('GET', '/api/best');
    } catch {
      return;
    }
    if (asked !== name || g !== gen) return;
    if (answer.status === 401) return setName(null);
    if (answer.status !== 200 || typeof answer.body !== 'object' || !answer.body) return;
    if (storeBest(asked, answer.body)) changed();
  }

  // Every level's best at once, as a function of n, in ms or null: signed
  // in, the account's (its cached bests and the runs waiting for it, or
  // finished signed out); signed out, this browser's runs, as before
  // accounts. Read once, for a whole selector.
  function bests() {
    const runs = [...queue.runs(), ...memory.map(m => m.record)];
    if (!name) {
      const best = fastest(runs);
      return n => best[n] ?? null;
    }
    const mine = new Set([...outbox(), ...memory.map(m => ({ id: m.record.id, name: m.name }))]
      .filter(e => e.name === null || e.name === name).map(e => e.id));
    const cache = read(BEST, null);
    const best = fastest(runs.filter(r => mine.has(r?.id)));
    const cached = cache?.name === name ? cache.best ?? {} : {};
    return n => mergedBest(n, cached, best[n] == null ? [] : [{ level: n, totalMs: best[n] }]);
  }

  return {
    get name() { return name; },
    // f(name) after the name changes, or the bests do.
    onChange: f => listeners.add(f),
    check, enter, logout, keep, flush, bests,
    best: n => bests()(n),
    // Settles once the upload and bests that follow a log in are done (tests).
    settled: () => Promise.all([done, sending]),
  };
}
