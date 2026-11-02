// Finished runs, kept in this browser (runs spec §6). A run goes in here as
// soon as it finishes. Part 2 sends the queue to the API and takes each run
// out once it is stored; until then every finished run stays here, and the
// best time comes from them.
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

  return { add, best };
}
