import { formatTime } from './finish.js';

// The daily challenge (2026-11-14-daily-challenge-design.md), with no DOM:
// the day's 20 problems, the level the game plays them as, the record of a
// try, the words the tile and the board show, and what this browser keeps
// of each day. Storage is passed in, so the tests can fake it.
//
// What this browser keeps:
// - mathtime.daily: {date: try}, the day's one scored try (spec §2), from
//   the moment its first problem is about to show. A try is
//   {id, started, ended, out, reached, totalMs, problems, current, shownAt, name}:
//   while it runs, `reached` is the question on screen, `problems` the ones
//   answered and `current` the one on screen ({a, b, misses}, shown at
//   `shownAt`, a wall-clock time), so a try cut off by a reload ends out
//   there, and `name` who was signed in when it started or last saved;
//   once ended, who was signed in then (null: signed out), the owner of
//   its upload.
// - mathtime.dailyBoard: {date: {name, rows, total}}, the last board
//   fetched for each day, for offline use, as `name` saw it (its `you`
//   is theirs: anyone else ignores it).
// Only the two latest days of each are kept.

export const QUESTIONS = 20;
const PER_LEVEL = 5;
export const TRY = 'mathtime.daily';         // the key whose changes other tabs hear (storage events)
const BOARDS = 'mathtime.dailyBoard';
const KEEP_DAYS = 2;

// The player's own calendar date (spec §1), as YYYY-MM-DD.
export function dateKey(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The date as the tile and the board show it, "Sat 14 Nov".
export function dayLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
}

// A generator of numbers in [0, 1), seeded with `text`: the same text, the
// same numbers, in every browser.
export function seeded(text) {
  let h = 1779033703 ^ text.length;
  for (const c of text) {
    h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// The day's 20 (spec §1): 5 different facts from each of Levels 1–4
// (`levels`, in build order), drawn by the generator seeded with the date,
// then shuffled. Each is {a, b, answer, level}.
export function dailyProblems(date, levels) {
  const rng = seeded(date);
  const twenty = [];
  for (const level of levels.slice(0, 4)) {
    const left = [...level.facts];
    for (let i = 0; i < PER_LEVEL; i++) twenty.push({ ...left.splice(Math.floor(rng() * left.length), 1)[0], level });
  }
  for (let i = twenty.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [twenty[i], twenty[j]] = [twenty[j], twenty[i]];
  }
  return twenty;
}

// The day's challenge as the game plays it (game.js): the 20 in order
// (pick() takes the first left), each with its own level, whose operator,
// answer length and words it is played with. The answer box is sized for
// the widest of the day's answers, so it never resizes during the run.
// The breadcrumb names it "Daily challenge".
export function dailyLevel(date, levels) {
  const problems = dailyProblems(date, levels);
  const first = problems[0].level;
  return {
    n: 0,
    daily: date,
    label: 'Daily challenge',
    topic: 'Daily',
    k: 'challenge',
    name: 'Daily challenge',
    op: first.op,
    word: first.word,
    livesPerProblem: 3,
    problemsPerRun: QUESTIONS,
    maxAnswerLength: Math.max(...problems.map(p => String(p.answer).length)),
    possibleAnswers: [...new Set(problems.map(p => String(p.answer)))],
    facts: problems.map(({ a, b, answer, level }) => ({ a, b, answer, level })),
    pick: () => 0,
  };
}

// The record of a try that ended (spec §2, §5): a run's record with
// daily: true, out, and reached, the question it ended on; no level (its
// problems come from four), and no totalMs when out. `problems` are
// {a, b, ms, misses}, the one it went out on last.
export function dailyRecord({ id, finishedAt, out, reached, totalMs, problems }) {
  const kept = problems.map(({ a, b, ms, misses }) => ({ a, b, ms: Math.max(0, Math.round(ms)), misses }));
  const record = {
    id,
    finishedAt: finishedAt.toISOString(),
    misses: kept.reduce((sum, p) => sum + p.misses, 0),
    problems: kept,
    daily: true,
    out,
    reached: out ? reached : QUESTIONS,
  };
  if (!out) record.totalMs = Math.round(totalMs);
  return record;
}

// 1st, 2nd, 3rd, 4th, … 11th, 12th, 13th, 21st.
export function ordinal(n) {
  const teen = n % 100 > 10 && n % 100 < 14;
  return n + ((!teen && { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10]) || 'th');
}

// A score as a board row shows it: the time, or "Out at 12".
export const rowScore = ({ totalMs, reached }) => (totalMs == null ? `Out at ${reached}` : formatTime(totalMs));

// A try's score as the tile shows it: the time, or "Out at 12 of 20".
export const tryScore = t => (t.out ? `Out at ${t.reached} of ${QUESTIONS}` : formatTime(t.totalMs));

// Your place on `board` (boardFrom()): {place, of}, from your row (`you`;
// the API adds it after its first 200 rows, at its real place) and the
// board's total, or null if you're not on it.
export function placeOn(board) {
  const you = board?.rows?.find(r => r?.you);
  return you ? { place: you.place, of: board.total ?? board.rows.length } : null;
}

// What the tile says (spec §3, and the UI review), set as a level row is:
// `line` under its title, `short` in its place if it doesn't fit, and,
// after the try, `best`, the score, under the check (or a lost heart, if
// out), as a finished row's best time is; `label`, its accessible name.
// - Before the try: "Sat 14 Nov · 20 problems, one try" (short: "Sat 14
//   Nov · one try").
// - After it: the date and your place where the board has you, "Sat 14 Nov
//   · 3rd of 7" (short: the place alone); the score on the right,
//   "1:04.2" or "Out at 12".
// - Started and not ended: being played in another tab (this one ends its
//   own when it leaves it).
export const IN_PROGRESS = 'In progress in another tab';
export function tileParts(date, t, place) {
  const day = dayLabel(date);
  if (t?.started && !t.ended) return { line: IN_PROGRESS, short: IN_PROGRESS, best: null, label: `Daily challenge: ${IN_PROGRESS}` };
  if (!t?.ended) {
    return { line: `${day} · 20 problems, one try`, short: `${day} · one try`, best: null, label: `Daily challenge, ${day}: 20 problems, one try` };
  }
  const where = place ? `${ordinal(place.place)} of ${place.of}` : null;
  const line = where ? `${day} · ${where}` : day;
  const best = t.out ? `Out at ${t.reached}` : formatTime(t.totalMs);
  return { line, short: where ?? day, best, label: `Daily challenge, ${day}: ${tryScore(t)}${where ? `, ${where}` : ''}. Show the board` };
}

// The lines over the board after a try (the UI review: the board reads as
// the finish screen does): `title` (the finish screen's title, "Daily
// challenge complete", or "Daily challenge: out"), `time` (its big time),
// `detail` (how it went out) and `place` (its muted line), any of them
// null. `t`, the try; `practice`, a practice just played instead ({out,
// reached, totalMs}). A try that went out says how: its third miss ("Out
// of lives at 5"), left ("Left at 5"), or, the server's score from another
// device, just "Out at 5".
export function resultParts(t, place, practice = null) {
  if (practice) {
    return practice.out
      ? { title: `Practice: out at ${practice.reached}`, time: null, detail: null, place: null }
      : { title: 'Practice', time: formatTime(practice.totalMs), detail: null, place: null };
  }
  if (!t?.ended) return null;
  const where = place ? `${ordinal(place.place)} of ${place.of}` : null;
  if (!t.out) return { title: 'Daily challenge complete', time: formatTime(t.totalMs), detail: null, place: where };
  const how = { lives: 'Out of lives', left: 'Left' }[t.how] ?? 'Out';
  return { title: 'Daily challenge: out', time: null, detail: `${how} at ${t.reached}`, place: where };
}

// The board as the API gives it ({date, total, rows}), checked: {rows,
// total}, its rows {place, name, totalMs, reached, you}, total how many
// are on it (the rows stop at 200, and your own, if further down); null if
// it is anything else.
export function boardFrom(body) {
  const rows = body?.rows;
  if (!Array.isArray(rows)) return null;
  const ok = r => r && Number.isSafeInteger(r.place) && typeof r.name === 'string'
    && (r.totalMs === null || Number.isFinite(r.totalMs)) && Number.isSafeInteger(r.reached);
  if (!rows.every(ok)) return null;
  const total = Number.isSafeInteger(body.total) && body.total >= 0 ? body.total : rows.length;
  return { rows: rows.map(r => ({ place: r.place, name: r.name, totalMs: r.totalMs, reached: r.reached, you: r.you === true })), total };
}

// The next local midnight after `now`, in ms from now: when the day, and
// so the tile, changes.
export function untilMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next - now;
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// What this browser keeps of each day (above). Storage can be missing or
// full: then a try lasts as long as the page, in memory.
export function createDailyStore(storage = browserStorage()) {
  const memory = { [TRY]: {}, [BOARDS]: {} };
  const read = key => {
    try {
      const value = JSON.parse(storage.getItem(key));
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch {}
    return memory[key];
  };
  // The latest days only, and the day given kept whatever its date.
  const write = (key, all, date) => {
    const days = Object.keys(all).sort().reverse();
    const kept = Object.fromEntries(days.filter((d, i) => i < KEEP_DAYS || d === date).map(d => [d, all[d]]));
    memory[key] = kept;
    try {
      storage.setItem(key, JSON.stringify(kept));
    } catch {}
  };

  return {
    // The day's try, or null if there is none yet.
    get: date => read(TRY)[date] ?? null,
    set(date, t) {
      write(TRY, { ...read(TRY), [date]: t }, date);
    },
    // Tries started and never ended (a reload, a closed tab), any day.
    unended: () => Object.entries(read(TRY)).filter(([, t]) => t?.started && !t.ended).map(([date, t]) => ({ date, t })),
    // The board kept for `date`, if `name` (null: signed out) fetched it.
    board(date, name) {
      const kept = read(BOARDS)[date];
      return kept && Array.isArray(kept.rows) && (kept.name ?? null) === (name ?? null) ? { rows: kept.rows, total: kept.total ?? kept.rows.length } : null;
    },
    keepBoard(date, board, name) {
      write(BOARDS, { ...read(BOARDS), [date]: { name: name ?? null, rows: board.rows, total: board.total } }, date);
    },
  };
}
