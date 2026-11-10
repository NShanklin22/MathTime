// Finished runs, kept in this browser (runs spec §6). A run goes in here as
// soon as it finishes, and stays: signed out, the best time comes from them.
// Signed in, account.js sends them to the account (its outbox, accounts
// spec §5), and the best comes from the account.
//
// Storage can be missing, blocked or full (Safari's private mode, cleared
// site data). Then nothing is kept, and the game plays on regardless.
const KEY = 'mathtime.runs';

// The browser's localStorage, or null where even reading it is refused.
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createQueue(storage = browserStorage()) {
  // The kept runs, oldest first: [] if there are none or they can't be read.
  function read() {
    try {
      const runs = JSON.parse(storage.getItem(KEY));
      return Array.isArray(runs) ? runs : [];
    } catch {
      return [];
    }
  }

  // Keep `record` after the others. Returns whether it was kept.
  function add(record) {
    try {
      storage.setItem(KEY, JSON.stringify([...read(), record]));
      return true;
    } catch {
      return false;
    }
  }

  // The fastest kept total time of Level `n`, in ms, or null if none is kept.
  function best(n) {
    const times = read().filter(r => r?.level === n && Number.isFinite(r.totalMs)).map(r => r.totalMs);
    return times.length ? Math.min(...times) : null;
  }

  // Keep `runs` in place of those kept (account.js drops the runs the API
  // has). Returns whether they were kept.
  function replace(runs) {
    try {
      storage.setItem(KEY, JSON.stringify(runs));
      return true;
    } catch {
      return false;
    }
  }

  return { add, best, runs: read, replace };
}
