import { formatTime } from './finish.js';
import { ordinal, dayLabel, IN_PROGRESS } from './daily.js';

// The home screen (2026-11-17-home-screen-design.md), with no DOM: what
// Next lesson starts, the progress per topic, the daily challenge's done
// line, and how a long board is cut. homeview.js draws them.

// Next lesson (spec §2): the first level not finished, in build order
// (`levels`, LEVELS); `finished(n)` says whether level n is. With every
// level finished, the one played last (`lastPlayed`, its n), or the last
// level if none is known: "Last played".
export function nextLesson(levels, finished, lastPlayed = null) {
  const left = levels.find(level => !finished(level.n));
  if (left) return { level: left, title: 'Next lesson' };
  const last = levels.find(level => level.n === lastPlayed) ?? levels[levels.length - 1];
  return { level: last, title: 'Last played' };
}

// Progress (spec §3a): a row per topic, in the order each first comes in
// `levels`: {topic, done, of}, its levels finished and built.
export function topicProgress(levels, finished) {
  const topics = [...new Set(levels.map(level => level.topic))];
  return topics.map(topic => {
    const of = levels.filter(level => level.topic === topic);
    return { topic, done: of.filter(level => finished(level.n)).length, of: of.length };
  });
}

// The daily challenge on Home (spec §2), from the day's try `t` and your
// place on the board (null: signed out, offline, or not on it):
// - before the try, 'start';
// - started and not ended, 'busy': being played in another tab, `res` what
//   to do about it;
// - after it, 'done', with `res`, the score and the place, "1:12.6 · 5th
//   of 9" (the score alone where there is no place; out, "Out at 12"), and
//   `short`, as much as a narrow Done row has room for: an out's place
//   without "of N", "Out at 12 · 9th" (a time and a place fit whole).
// `label` is the hero's accessible name.
export const OTHER_TAB = 'Finish it in the other tab';
export function heroParts(date, t, place) {
  const day = dayLabel(date);
  if (t?.started && !t.ended) return { state: 'busy', day, res: OTHER_TAB, short: OTHER_TAB, label: `Daily challenge, ${day}: ${IN_PROGRESS}` };
  if (!t?.ended) return { state: 'start', day, res: null, short: null, label: `Daily challenge, ${day}: 20 problems, one try. Start` };
  const score = t.out ? `Out at ${t.reached}` : formatTime(t.totalMs);
  const res = place ? `${score} · ${ordinal(place.place)} of ${place.of}` : score;
  const short = place && t.out ? `${score} · ${ordinal(place.place)}` : res;
  return { state: 'done', day, res, short, label: `Daily challenge, ${day}: done, ${res.replace(' · ', ', ')}. Show the board` };
}

// The board's filled button (spec §3b), for the board of `date` (today is
// `today`) and that day's try `t`: before today's try, 'start' (the try);
// after it, 'practice'; a try being played in another tab, 'busy' (it says
// so, as Home does); a past day never played, 'none' (nothing to play).
export function boardButton(date, today, t) {
  if (t?.started && !t.ended) return 'busy';
  if (t?.ended) return 'practice';
  return date === today ? 'start' : 'none';
}

// A long board (spec §3b): `count` rows, each `row` tall, in `room`, your
// row at index `at` (-1: not on it); `pinRoom`, the room your row pinned at
// the list's foot takes, with the "⋯" break above it.
// Every row fits: none scroll. Else the list is a whole number of rows
// tall, opening at 1st place (`start`, the first row shown), and your row,
// if below its view, is pinned under it, the list then shorter by the
// pin's room: only where rows are really hidden between the last one shown
// and yours, so the "⋯" is never false. Where the room is too short for a
// row and the pin both, there is no pin: the list opens with your row at
// its foot instead, so it is never hidden.
// Returns {scrolls, shown, pinned, start}: shown, the rows the list is tall.
export function cutBoard({ count, at, room, row, pinRoom }) {
  if (count * row <= room + 0.5) return { scrolls: false, shown: count, pinned: false, start: 0 };
  const all = Math.max(1, Math.floor((room + 0.5) / row));
  if (at < all) return { scrolls: true, shown: all, pinned: false, start: 0 };
  const withPin = Math.floor((room - pinRoom + 0.5) / row);
  if (withPin >= 1 && at > withPin) return { scrolls: true, shown: withPin, pinned: true, start: 0 };
  return { scrolls: true, shown: all, pinned: false, start: at - all + 1 };
}
