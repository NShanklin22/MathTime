// Made-up players on the daily board (fake board spec): ten a day, made from the date alone, so every
// caller sees the same ones and nothing is stored. Most are easy to beat; each real score pushes one off.

export const FAKE_ROWS = 10;

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

// The ten scores, best first: [lowest, highest] time in ms, or the question an out ended on.
const SHAPES = [
  { ms: [58_000, 70_000] },
  { ms: [75_000, 110_000] },
  { ms: [75_000, 110_000] },
  { ms: [110_000, 240_000] },
  { ms: [110_000, 240_000] },
  { ms: [110_000, 240_000] },
  { ms: [110_000, 240_000] },
  { ms: [110_000, 240_000] },
  { reached: [9, 17] },
  { reached: [4, 12] },
];

// A small seeded generator, so a date always makes the same players.
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

// The date's made-up players, best first, shaped as store board rows (user_id null). `taken` holds the
// lower-cased names of real accounts, which are never used.
export function fakesFor(date, taken = new Set()) {
  const rand = seeded(`mathtime:${date}`);
  const between = ([lo, hi]) => lo + Math.floor(rand() * (hi - lo + 1));
  // Each time's tenths its own digit, so the board never shows a run of them alike.
  const tenths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = tenths.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [tenths[i], tenths[j]] = [tenths[j], tenths[i]];
  }
  const time = (range, i) => { const t = between(range); return t - (t % 1000) + tenths[i] * 100 + (t % 100); };
  const names = [...HANDLES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  // Each score gets its name first, so a name a real account takes changes only its own row: the
  // next spare handle stands in.
  const spares = names.slice(SHAPES.length).filter((n) => !taken.has(n.toLowerCase()));
  const rows = [];
  SHAPES.forEach((shape, i) => {
    const score = shape.ms
      ? { user_id: null, out: 0, total_ms: time(shape.ms, i), reached: 20 }
      : { user_id: null, out: 1, total_ms: null, reached: between(shape.reached) };
    const name = taken.has(names[i].toLowerCase()) ? spares.shift() : names[i];
    if (name) rows.push({ ...score, name });
  });
  return rows.sort(compareScores);
}
