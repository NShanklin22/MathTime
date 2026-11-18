import { formatTime } from './finish.js';
import { cutBoard } from './home.js';
import { dayLabel, resultParts, rowScore } from './daily.js';

// The daily challenge's board (2026-11-14-daily-challenge-design.md §4),
// as the home mockup (2026-11-17) draws it (the home screen spec §3b).

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/// ---------- The board (spec §4, the home screen spec §3b) ----------
// In `root` (index.html): the title, the date and how many played, the
// rows, Practice and Levels, which call practice() and levels(). Before
// today's try, Start in Practice's place, which calls start(); while a try
// is played in another tab, in its place what to do about it, as Home
// says; on a past day never played, Levels alone. Signed out, your score
// above the rows with "Log in to be on tomorrow's board", which calls
// login(). Offline, with no board kept, your score and "The board will
// show when you're back online"; or, the API busy, "The board is busy: try
// again in a minute".
export const OFFLINE = 'The board will show when you’re back online';
export const BUSY = 'The board is busy: try again in a minute';
export function createDailyBoard(root, { practice, start, levels, login }) {
  const $ = sel => root.querySelector(sel);
  const rows = $('.rows'), mine = $('.mine'), list = $('.b-list'), pin = $('.b-pin'), pinned = $('.b-pin .r');
  const go = $('.practice'), busy = $('.b-busy'), btns = $('.b-btns');
  let state = 'practice';              // home.js boardButton()
  go.addEventListener('click', e => (state === 'start' ? start(e) : practice(e)));
  $('.levels').addEventListener('click', levels);

  // The Enter of the last answer may still be held: its key repeat would
  // otherwise press Practice as soon as it has focus.
  root.addEventListener('keydown', e => {
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
  });

  function row(tag, p, place, you) {
    const r = el(tag, `r${p.totalMs == null ? ' out' : ''}${you ? ' you' : ''}`);
    if (you && tag === 'li') r.setAttribute('aria-current', 'true');
    r.append(el('span', 'place', String(place)), el('span', 'who', p.name), el('span', 'score', rowScore(p)));
    return r;
  }

  // The filled button as the day's try stands (home.js boardButton()), and
  // whether a start is being checked (main.js openDaily(): it waits, once).
  // Busy, in its place a line saying what to do, and Levels alone; the
  // focus, if it was on the button, goes to Levels.
  function showButton(next, waiting = false) {
    const had = document.activeElement === go;
    state = next;
    go.textContent = state === 'start' ? 'Start' : 'Practice';
    go.hidden = state === 'busy' || state === 'none';
    busy.hidden = state !== 'busy';
    btns.classList.toggle('alone', go.hidden);
    if (had && go.hidden) $('.levels').focus({ preventScroll: true });
    go.classList.toggle('waiting', waiting);
    if (waiting) go.setAttribute('aria-busy', 'true');
    else go.removeAttribute('aria-busy');
  }

  // `date`; `t`, the day's try; `board`, {rows, total}, or null when it
  // can't be had, and `note` says why, or while it is `loading` (nothing
  // said yet, not even how many played); `name`, who is signed in, or null.
  // Your own score is named as the try's owner (null: signed out, "You").
  // Under the title, the date and how many played; just after a practice,
  // its result on a line of its own under them, or, just after a try that
  // went out, how it went out (daily.js resultParts): your row says the
  // rest.
  // `practice`, a practice just played ({out, reached, totalMs});
  // `fresh`, the try just ended here. Signed out, a try is never put on the
  // board (spec §5): "Log in to be on tomorrow's board". Signed in, a try
  // played signed out says so, in place of a place. `button`, the filled
  // button's state (home.js boardButton()); `waiting`, a start being checked.
  function show({ date, t, board, name, note = OFFLINE, loading = false, practice = null, fresh = false, place: where = null, button = 'practice', waiting = false }) {
    const list = board?.rows ?? null;
    const parts = practice || (fresh && t?.out) ? resultParts(t, where, practice) : null;
    const said = parts ? (practice ? [parts.title, parts.time].filter(Boolean).join(' ') : parts.detail) : null;
    const count = list ? `${board.total ?? list.length} played` : null;
    $('.b-date').textContent = [dayLabel(date), count].filter(Boolean).join(' · ');
    const result = $('.b-said');
    result.textContent = said ?? '';
    result.hidden = !said;
    showButton(button, waiting);
    mine.replaceChildren();
    const onIt = !!list?.some(r => r.you);
    if (t?.ended && !(name && onIt)) {
      const own = { name: t.name ?? 'You', totalMs: t.out ? null : t.totalMs, reached: t.reached };
      const r = row('div', own, '–', true);
      r.setAttribute('aria-label', `Your score: ${t.out ? `out at ${t.reached} of 20` : formatTime(t.totalMs)}`);
      mine.append(r);
      if (!list) {
        if (!loading) mine.append(el('p', 'note', note));
      } else if (!name) {
        const link = el('button', 'swap', 'Log in to be on tomorrow’s board');
        link.type = 'button';
        link.addEventListener('click', login);
        mine.append(link);
      } else if (!t.name) mine.append(el('p', 'note', 'Played signed out: not on today’s board'));
    } else if (!list && !loading) mine.append(el('p', 'note', note));
    rows.hidden = !list;
    root.classList.toggle('no-rows', !list);
    root.classList.toggle('has-mine', mine.childElementCount > 0);
    root.classList.toggle('has-said', !!said);
    // The same board again, while it stays on screen (asked again, or
    // fetched by another tab), keeps its place; a new one, or the board
    // opened afresh (open()), opens at its top.
    const key = JSON.stringify([date, list]);
    keepTop = key === shownKey ? rows.scrollTop : null;
    shownKey = key;
    rows.replaceChildren(...(list ?? []).map(p => row('li', p, p.place, !!name && p.you)));
    // Places past 99 (your own row, after the first 200): the column as
    // wide as the longest, the same in every row.
    const widest = Math.max(2, ...(list ?? []).map(p => String(p.place).length));
    if (widest > 2) root.style.setProperty('--place-w', widest + 'ch');
    else root.style.removeProperty('--place-w');
    const you = rows.querySelector('.you');
    pinned.replaceChildren(...(you ? [...you.children].map(c => c.cloneNode(true)) : []));
    pinned.classList.toggle('out', !!you?.classList.contains('out'));
    place();
  }

  // A list too long for its room scrolls alone, a whole number of rows
  // tall, opening at 1st place; your row, below its view, pinned at its
  // foot after the "⋯" (home.js cutBoard()), and hidden there, its room
  // kept, while you scroll it into the list's view. Run after every layout:
  // a new board opens at its top, the same board keeps its place.
  // A short board that just misses its room for the lines its own boards
  // don't have (your score above it, a line under the date) has its rows a
  // little shorter, down to FIT of their height, so it shows whole, as it
  // would without them; a long board scrolls.
  const FIT = 0.8;
  let shownKey = null, keepTop = null, placedKey = null;
  function place() {
    if (!root.getClientRects().length) return;
    const fresh = keepTop === null && placedKey !== shownKey;
    const keep = keepTop ?? rows.scrollTop;
    placedKey = shownKey;
    keepTop = null;
    rows.classList.remove('scrolls');
    list.classList.remove('pinned');
    rows.style.height = '';
    for (const li of rows.children) li.style.height = '';
    pin.hidden = true;
    pin.classList.remove('away');
    if (rows.hidden || !rows.firstElementChild) return;
    const room = rows.clientHeight;
    const count = rows.children.length;
    const row = rows.firstElementChild.getBoundingClientRect().height;
    if (count * row <= room + 0.5) return;
    if (root.matches('.has-mine, .has-said') && count * row * FIT <= room + 0.5) {
      const dpr = devicePixelRatio, h = Math.floor(room / count * dpr) / dpr;
      for (const li of rows.children) li.style.height = h + 'px';
      return;
    }
    const you = rows.querySelector('.you');
    const at = you ? [...rows.children].indexOf(you) : -1;
    pin.hidden = false;
    const pinRoom = pin.getBoundingClientRect().height;
    pin.hidden = true;
    const cut = cutBoard({ count, at, room, row, pinRoom });
    rows.classList.add('scrolls');
    if (cut.pinned) {
      pin.hidden = false;
      list.classList.add('pinned');
    }
    rows.style.height = cut.shown * row + (rows.offsetHeight - rows.clientHeight) + 'px';
    rows.scrollTop = fresh ? cut.start * row : keep;
    away();
  }
  // Your pinned row hides, its room kept, while your row shows in the list.
  function away() {
    if (pin.hidden) return;
    const you = rows.querySelector('.you');
    const a = rows.getBoundingClientRect(), b = you.getBoundingClientRect();
    pin.classList.toggle('away', b.top >= a.top - 0.5 && b.bottom <= a.bottom + 0.5);
  }
  rows.addEventListener('scroll', away);

  // The filled button, or Levels where there is none, or `which`: 'levels',
  // back from the selector it opened.
  function focus(which = null) {
    (which === 'levels' || go.hidden ? $('.levels') : go).focus({ preventScroll: true });
  }

  // Opened afresh (main.js showBoard()): its next drawing opens at the top.
  function open() {
    shownKey = placedKey = null;
  }

  return { show, place, focus, open, waiting: on => showButton(state, on) };
}
