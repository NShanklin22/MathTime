import { snap, onLayoutGrid } from './ink.js';
import { formatTime } from './finish.js';
import { reveal } from './reveal.js';
import { dayLabel, tileParts, resultParts, rowScore } from './daily.js';

// The daily challenge's tile and board (2026-11-14-daily-challenge-design.md
// §3–§4), as the daily mockup (2026-11-14) draws them.

// The keypad's check, and a heart, their viewBoxes cropped to their ink.
const TICK = '<svg class="tick" viewBox="2 5 20 14.5"><path d="M3.5 12.5l5.5 5.5l11.5-11.5"/></svg>';
const HEART = '<svg class="heart" viewBox="2 3 20 18"><path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"/></svg>';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// ---------- The tile (spec §3) ----------
// A level row's tile, full width, at the top of the selector's list, in
// its top padding (styles.css), so the selector, which fits the topic
// columns to the room, counts it without knowing it is there. Before the
// try: "Daily challenge", the date, and the problem kinds set as the
// samples are. After: the score (and place), with a finished row's check,
// or a lost heart if out. A tap or Enter calls open().
export function createDailyTile(select, scan, { open }) {
  const tile = el('button', 'row daily');
  tile.type = 'button';
  tile.innerHTML = '<span class="txt"><span class="title">Daily challenge</span><span class="name"></span></span>'
    + '<span class="sample kinds" aria-hidden="true"><span>+</span><span>−</span><span>×</span></span>'
    + '<span class="result" aria-hidden="true"></span>';
  select.prepend(tile);
  tile.addEventListener('click', e => open(e));

  // `t` is the day's try (daily.js), `place` your place on the board or null.
  let parts = null;
  function show(date, t, place) {
    const after = !!t?.ended;
    parts = tileParts(date, t, place);
    tile.querySelector('.name').textContent = parts.line;
    tile.classList.toggle('finished', after);
    tile.classList.toggle('out', after && t.out);
    const result = tile.querySelector('.result');
    result.innerHTML = after ? (t.out ? HEART : TICK) : '';
    if (after) result.append(el('span', 'best', parts.best));
    tile.setAttribute('aria-label', parts.label);
  }

  // A text's ink box as drawn (a Range: the line's own box is the column's).
  const textBox = node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect();
  };
  // The line under the title, whole where it keeps 15px clear of what is on
  // the right (the kinds, or the score), as a row's name does; else short.
  // Its ink starts on the padding edge, as the selector lines it up (its
  // inkLeft): placed again here when the line changes, in this same
  // layout, so the selector's next finds it measured.
  function fitLine(clearOf) {
    const name = tile.querySelector('.name');
    const was = name.textContent;
    name.textContent = parts.line;
    if (parts.short !== parts.line && textBox(name).right > clearOf - 15) name.textContent = parts.short;
    if (name.textContent === was) return;
    const dpr = devicePixelRatio;
    name.style.marginLeft = '';
    const cs = getComputedStyle(name), fs = parseFloat(cs.fontSize);
    const style = { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: (parseFloat(cs.letterSpacing) || 0) / fs };
    const left = name.getBoundingClientRect().left;
    name.style.marginLeft = onLayoutGrid(snap(left + scan(name.textContent, style, fs * dpr).abl * fs, dpr) - left, dpr) + 'px';
  }
  // The score's ink ends at the row's padding edge, as a row's best time's
  // does (selector.js), on a whole device pixel.
  function inkRight(node, edge) {
    const dpr = devicePixelRatio;
    node.style.left = '';
    const cs = getComputedStyle(node), fs = parseFloat(cs.fontSize);
    const style = { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: (parseFloat(cs.letterSpacing) || 0) / fs };
    const left = node.getBoundingClientRect().left;
    node.style.left = onLayoutGrid(snap(edge - scan(node.textContent, style, fs * dpr).abr * fs, dpr) - left, dpr) + 'px';
  }

  // In topic columns, as wide as the grid and where it starts; the kinds'
  // last ink on the row's padding edge, their band on its middle, each on
  // whole device pixels. Run after the selector's layout.
  function place() {
    if (!tile.getClientRects().length) return;
    const groups = select.querySelector('.groups');
    if (select.classList.contains('cols')) {
      const cs = getComputedStyle(select), n = Number(cs.getPropertyValue('--cols'));
      const w = n * parseFloat(cs.getPropertyValue('--tile')) + (n - 1) * parseFloat(cs.getPropertyValue('--col-gap'));
      select.style.setProperty('--daily-w', w + 'px');
      select.style.setProperty('--daily-x', groups.style.marginLeft || '0px');
    } else {
      select.style.removeProperty('--daily-w');
      select.style.removeProperty('--daily-x');
    }
    const kinds = tile.querySelector('.kinds');
    const best = tile.querySelector('.result .best');
    if (best?.getClientRects().length) {
      const r0 = tile.getBoundingClientRect();
      inkRight(best, r0.right - parseFloat(getComputedStyle(tile).paddingRight));
      fitLine(Math.min(textBox(best).left, tile.querySelector('.result svg').getBoundingClientRect().left));
    }
    if (!kinds.getClientRects().length) return;
    const dpr = devicePixelRatio;
    kinds.style.removeProperty('--ink-dx');
    kinds.style.removeProperty('--ink-dy');
    const cs = getComputedStyle(kinds), fs = parseFloat(cs.fontSize);
    const style = { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: 0 };
    const last = kinds.lastElementChild, m = scan(last.textContent, style, fs * dpr);
    const r = tile.getBoundingClientRect(), edge = r.right - parseFloat(getComputedStyle(tile).paddingRight);
    kinds.style.setProperty('--ink-dx', onLayoutGrid(snap(edge - m.abr * fs, dpr) - last.getBoundingClientRect().left, dpr) + 'px');
    const each = [...kinds.children].map(s => scan(s.textContent, style, fs * dpr));
    const top = Math.min(...each.map(e => -e.asc)), bottom = Math.max(...each.map(e => e.desc));
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    last.appendChild(probe);
    const baseline = probe.getBoundingClientRect().top;
    probe.remove();
    const mid = baseline + (top + bottom) / 2 * fs;
    kinds.style.setProperty('--ink-dy', onLayoutGrid(snap(r.top + r.height / 2 - mid + baseline, dpr) - baseline, dpr) + 'px');
    fitLine(kinds.firstElementChild.getBoundingClientRect().left);
  }

  // The focus, coming back from the challenge, its ring in sight.
  function focus() {
    tile.focus({ preventScroll: true });
    reveal(select, tile, 6);
  }

  return { show, place, focus, el: tile };
}

// ---------- The board (spec §4) ----------
// In `root` (index.html): the date, the rows, Practice and Levels, which
// call practice() and levels(). Signed out, your score above the rows with
// "Log in to get on the board", which calls login(). Offline, with no board
// kept, your score and "The board will show when you're back online"; or,
// the API busy, "The board is busy: try again in a minute".
const ROW = 40;
const SIDE_MIN = 2 * 300 + 40 + 2 * 24;
export const OFFLINE = 'The board will show when you’re back online';
export const BUSY = 'The board is busy: try again in a minute';
export function createDailyBoard(root, { practice, levels, login }) {
  const $ = sel => root.querySelector(sel);
  const rows = $('.rows'), mine = $('.head .mine');
  $('.practice').addEventListener('click', practice);
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

  // `date`; `t`, the day's try; `board`, {rows, total}, or null when it
  // can't be had, and `note` says why; `name`, who is signed in, or null.
  // Your own score is named as the try's owner (null: signed out, "You").
  // The result over the board, as the finish screen's lines (daily.js
  // resultParts): its title, its big time and its muted place; a line
  // with nothing to say takes no room.
  const result = $('.outcome');
  function showResult(parts) {
    result.hidden = !parts;
    root.classList.toggle('has-outcome', !!parts);
    for (const key of ['title', 'time', 'detail', 'place']) {
      const line = result.querySelector(`.o-${key}`);
      line.textContent = parts?.[key] ?? '';
      line.hidden = !parts?.[key];
    }
  }

  // `practice`, a practice just played ({out, reached, totalMs}), shown over
  // the board in place of the try's result; `place`, your place on it.
  // Signed out, a try is never put on the board (spec §5): "Log in to be on
  // tomorrow's board". Signed in, a try played signed out says so, in place
  // of a place.
  function show({ date, t, board, name, note = OFFLINE, practice = null, place: where = null }) {
    showResult(resultParts(t, where, practice));
    $('.title').textContent = dayLabel(date);
    mine.replaceChildren();
    const list = board?.rows ?? null;
    const onIt = !!list?.some(r => r.you);
    if (t?.ended && !(name && onIt)) {
      const own = { name: t.name ?? 'You', totalMs: t.out ? null : t.totalMs, reached: t.reached };
      const r = row('div', own, '–', true);
      r.setAttribute('aria-label', `Your score: ${t.out ? `out at ${t.reached} of 20` : formatTime(t.totalMs)}`);
      mine.append(r);
      if (!list) mine.append(el('p', 'note line wrap', note));
      else if (!name) {
        const link = el('button', 'swap', 'Log in to be on tomorrow’s board');
        link.type = 'button';
        link.addEventListener('click', login);
        mine.append(link);
      } else if (!t.name) mine.append(el('p', 'note line wrap', 'Played signed out: not on today’s board'));
    }
    rows.hidden = !list;
    root.classList.toggle('no-rows', !list);
    rows.replaceChildren(...(list ?? []).map(p => row('li', p, p.place, !!name && p.you)));
    // Places past 99 (your own row, after the first 200): the column as
    // wide as the longest, the same in every row.
    const widest = Math.max(2, ...(list ?? []).map(p => String(p.place).length));
    if (widest > 2) rows.style.setProperty('--place-w', widest + 'ch');
    else rows.style.removeProperty('--place-w');
    place();
  }

  // A list too long for its room scrolls, a whole number of rows tall,
  // opened with your row in the middle. Run after every layout.
  let shownRows = null;
  function place() {
    if (!root.getClientRects().length) return;
    const first = shownRows !== rows.firstElementChild;
    shownRows = rows.firstElementChild;
    const keep = rows.scrollTop;
    rows.classList.remove('scrolls');
    rows.style.height = '';
    // Side by side (styles.css .side) where the rows don't all show stacked
    // and two columns of 300px fit, 40px apart, inside the gutters: the
    // rows then have the whole height.
    const over = () => !rows.hidden && rows.scrollHeight > rows.clientHeight + 1;
    root.classList.remove('side');
    if (over() && document.body.clientWidth >= SIDE_MIN) root.classList.add('side');
    if (!over()) return;
    rows.classList.add('scrolls');
    const fit = Math.max(1, Math.floor(rows.clientHeight / ROW));
    rows.style.height = fit * ROW + 2 + 'px';
    const you = rows.querySelector('.you');
    if (first && you) rows.scrollTop = Math.max(0, Math.round((you.offsetTop - rows.firstElementChild.offsetTop) / ROW - (fit - 1) / 2)) * ROW;
    else if (!first) rows.scrollTop = keep;
  }

  function focus() {
    $('.practice').focus({ preventScroll: true });
  }

  return { show, place, focus };
}
