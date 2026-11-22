// The crowd on the daily board (crowd spec): 10,000 players a day, and 100 more for every account, made
// from the date alone, so every caller sees the same ones and nothing is stored. The best ten have names;
// the rest only give real players their places.

export const CROWD_BASE = 10_000;
export const PER_ACCOUNT = 100;
export const MAX_CROWD = 100_000;
export const SHOWN = 10;
const MEDIAN_MS = 150_000;
const SIGMA = 0.39;
const OUT_SHARE = 0.12;
const FLOOR_MS = 30_000;

// Plain handles, as sign-up allows them (3 to 20 of letters, digits, _ and -).
const HANDLES = [
  'mathfox', 'quietowl', 'sum_ruler', 'tenfingers', 'carry_one', 'jlee88', 'dana_k', 'pixelpanda',
  'numbat', 'rkm', 'slowandsure', 'mo_ali', 'tess92', 'abacus', 'bluefinch', 'gridlock', 'kofi',
  'times_tom', 'nora-b', 'zed', 'minus_mia', 'peterpi', 'wren', 'fourfours', 'lucky7s', 'sam_r',
  'ollie', 'divvy', 'ivy-m', 'bjorn', 'hexa', 'marisol', 'quickmaths', 'ben10x', 'cleo', 'figgy',
  'tallyho', 'remainder', 'kai_w', 'pencilpusher', 'yuki', 'noodle', 'ace_of_sums', 'reza', 'jo-jo',
  'mapleleaf', 'otis', 'ninebyNine', 'evenodd', 'ruth_t', 'dax', 'lemonzest', 'priya_s', 'gus',
  'squareroot', 'hal', 'twotimes', 'ember', 'axel_j', 'vera',
];

// A small seeded generator, so a date always makes the same crowd.
function seeded(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Board order: finishers by time, then outs by how far they got.
export function compareScores(a, b) {
  return a.out - b.out || (a.out ? b.reached - a.reached : a.total_ms - b.total_ms);
}

export const crowdSize = (accounts) => Math.min(MAX_CROWD, CROWD_BASE + PER_ACCOUNT * accounts);

export const NO_CROWD = { size: 0, times: [], handles: [], drawn: [], outsAt: new Array(21).fill(0) };

// The date's crowd of `size`: its finishers' times, best first, each one's handle (an index into
// HANDLES, so a name stays with its player), and how many went out at each question. Each player takes
// four draws, so a bigger crowd only adds players after the same first ones. The last few crowds made
// are kept, the one asked for last kept longest.
const made = new Map();
export function crowdFor(date, size) {
  const key = `${date}:${size}`;
  const had = made.get(key);
  if (had) {
    made.delete(key);
    made.set(key, had);
    return had;
  }
  const rand = seeded(`mathtime:crowd:${date}`);
  const finished = [];
  const outsAt = new Array(21).fill(0);
  for (let i = 0; i < size; i++) {
    const a = rand(), b = rand(), c = rand(), d = rand();
    if (a < OUT_SHARE) {
      outsAt[2 + Math.floor(b * 18)]++;
      continue;
    }
    const z = Math.sqrt(-2 * Math.log(1 - b)) * Math.cos(2 * Math.PI * c);
    finished.push([Math.max(FLOOR_MS, Math.round(MEDIAN_MS * Math.exp(SIGMA * z))), Math.floor(d * HANDLES.length), i]);
  }
  finished.sort((x, y) => x[0] - y[0]);
  const crowd = { size, times: finished.map((f) => f[0]), handles: finished.slice(0, SHOWN).map((f) => f[1]), drawn: finished.slice(0, SHOWN).map((f) => f[2]), outsAt };
  if (made.size >= 8) made.delete(made.keys().next().value);
  made.set(key, crowd);
  return crowd;
}

// How many of the crowd did strictly better than `score` (a store board row).
export function crowdBetter(crowd, score) {
  if (score.out) {
    let n = crowd.times.length;
    for (let r = score.reached + 1; r < crowd.outsAt.length; r++) n += crowd.outsAt[r];
    return n;
  }
  let lo = 0, hi = crowd.times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (crowd.times[mid] < score.total_ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// The crowd's best ten, named, shaped as store board rows (user_id null). Each player has a handle of
// their own; where two of the ten have the same, the one made first keeps it. The other, or one whose
// handle a real account holds (`taken`, lower-cased names), takes the next handle along that none of
// the ten has, so a name stays with its player and a clash changes only its own row.
export function crowdTop(crowd, taken = new Set()) {
  const top = crowd.times.slice(0, SHOWN).map((total_ms, i) => ({ total_ms, h: crowd.handles[i], drawn: crowd.drawn[i] }));
  const keeps = new Map();
  for (const p of top) {
    if (taken.has(HANDLES[p.h].toLowerCase())) continue;
    if (!keeps.has(p.h) || keeps.get(p.h).drawn > p.drawn) keeps.set(p.h, p);
  }
  const used = new Set(keeps.keys());
  const rows = [];
  for (const p of top) {
    let at = p.h;
    if (keeps.get(at) !== p) {
      let k = 0;
      do at = (at + 1) % HANDLES.length;
      while (++k < HANDLES.length && (used.has(at) || taken.has(HANDLES[at].toLowerCase())));
      if (used.has(at) || taken.has(HANDLES[at].toLowerCase())) continue;
      used.add(at);
    }
    rows.push({ user_id: null, name: HANDLES[at], out: 0, total_ms: p.total_ms, reached: 20 });
  }
  return rows;
}
