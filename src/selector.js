import { reveal } from './reveal.js';
import { formatTime } from './finish.js';
import { band, snap, onLayoutGrid } from './ink.js';

const DIGITS = [...'0123456789'];

// Room a row's focus ring keeps from the list's edge when the list scrolls
// to it (reveal.js): the least bottom padding's 6px.
const CLEAR = 6;

// How long after a tap its double tap can still come.
const DOUBLE_TAP_MS = 400;

// A level row's accessible name: its topic, as its heading shows it, its
// number within that topic and its name, "Subtraction, Level 3: Column
// subtraction", and once it is finished, its best time `bestMs`
// (finished-mark spec §4). null is unfinished; 0 is a time.
export function rowLabel(level, bestMs) {
  const label = `${level.topic}, Level ${level.k}: ${level.name}`;
  return bestMs == null ? label : `${label}. Finished, best ${formatTime(bestMs)}.`;
}

// A locked row's name (accounts spec §2): signed out, a level that isn't
// free says so in place of its best.
export const lockedLabel = level => `${rowLabel(level, null)}, locked: log in to play`;

// The keypad's check (index.html), its viewBox cropped to its ink.
const CHECK = '<svg class="tick" viewBox="2 5 20 14.5"><path d="M3.5 12.5l5.5 5.5l11.5-11.5"/></svg>';
// A locked row's lock (the accounts mockup), in place of its sample or its
// result: a shackle over a body, and a keyhole, its viewBox cropped to its
// ink, stroke included.
const LOCK = '<svg class="lock" viewBox="-0.35 -0.35 16.7 20.7" aria-hidden="true"><path d="M4 9V5a4 4 0 0 1 8 0v4"/><rect x="1" y="9" width="14" height="10" rx="1"/><path d="M8 13v2"/></svg>';

// The levels in the order the selector shows them (Levels 6–7 batch plan):
// grouped by topic, the topics in the order each first comes in `levels`
// (route order), and each topic's levels in route order. So Level 6,
// column addition, joins Level 1 under Addition, as its "Level 2".
export function byTopic(levels) {
  const topics = [...new Set(levels.map(level => level.topic))];
  return topics.flatMap(topic => levels.filter(level => level.topic === topic));
}

// The topic columns (the topic-columns mockup, 2026-11-07): which grid.
// The topics, `heights` tall, go into bands of columns, one topic a
// column, left to right in order; the bands `gap` apart, each as tall as
// its tallest topic. `most` columns fit across (tiles at their least
// width); fewer than two, and it is no grid: null, the one stacked column.
// Otherwise:
// - the bands are as even as they come (6 topics in 4 columns are 2 bands
//   of 3; 4 in 3, 2 of 2), so no band is ragged against another and the
//   columns are the same in every band;
// - a band has at most `cap` columns where the height allows: 4 topics are
//   one band; 6 are 3 + 3, at the full tile, not 6 narrow tiles;
// - where that won't fit in `room`, more columns a band, up to `most`, as
//   long as the grid gets shorter and fits; where none fits, the shortest
//   of them (the first, of equals), and the list scrolls.
// Returns the columns a band, the grid's height and whether it scrolls.
export function gridFor(heights, gap, room, most, cap = 4) {
  most = Math.min(most, heights.length);
  if (most < 2) return null;
  const shape = c => {
    const bands = Math.ceil(heights.length / c), cols = Math.ceil(heights.length / bands);
    let h = (bands - 1) * gap;
    for (let b = 0; b < bands; b++) h += Math.max(...heights.slice(b * cols, (b + 1) * cols));
    return { cols, h };
  };
  let chosen = null;
  for (let c = Math.min(cap, most); c <= most; c++) {
    const s = shape(c);
    if (s.h <= room) { chosen = s; break; }
    if (!chosen || s.h < chosen.h) chosen = s;
  }
  return { ...chosen, scrolls: chosen.h > room };
}

// A tile's width, `n` tiles `gap` apart across `width` (the room inside the
// header title's inset on both sides): its share, down to a whole number
// of `dpr` device pixels, and never more than `max`. The gap is a whole
// number of device pixels too, so every column's edges are on them.
export function tileFor(width, n, gap, max, dpr) {
  const share = (width - (n - 1) * gap) / n;
  return Math.min(max, Math.floor(share * dpr + 1e-6) / dpr);
}

// The level selector (Level 2 spec §3): a row per built level, grouped by
// topic (byTopic()), each a button that calls choose(level). The rows are
// in the page in the order shown, so the keyboard follows them. The level
// you came from gets the focus (and aria-current). layout()
// puts the topics in columns where the width allows (fit()), then
// lines the labels, samples and finished rows' times up on their ink,
// measured with `scan` (Level 2 spec §5), as layout.js does the equation;
// it can run any number of times.
export function createSelector(root, levels, choose, scan) {
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const rows = new Map();                    // level → its row
  // A double tap on the finish screen's "Levels" must not go on to press
  // the row that takes its place. So when a tap brings the selector up,
  // a press that starts before its double tap is over is ignored, and
  // takes no focus from the marked row. A press is judged by its start: a
  // tap by its pointer down, if one was seen since the last press; a key
  // press (no detail), or a tap without one, by its own time.
  let pressableAt = -Infinity, downAt = null;
  root.addEventListener('pointerdown', e => { downAt = e.timeStamp; }, true);
  root.addEventListener('mousedown', e => { if (e.timeStamp < pressableAt) e.preventDefault(); });
  // The groups' own box, which fit() makes the grid of topic columns.
  const groups = el('div', 'groups');
  root.append(groups);
  let group = null;
  for (const level of byTopic(levels)) {
    if (group?.dataset.topic !== level.topic) {
      group = el('section', 'group');
      group.dataset.topic = level.topic;
      group.append(el('h2', 'group-name', level.topic));
      groups.append(group);
    }
    const row = el('button', 'row');
    row.dataset.level = level.n;
    row.setAttribute('aria-label', rowLabel(level, null));
    const txt = el('span', 'txt');
    // Numbered within its topic, under the topic's heading (levels.js).
    txt.append(el('span', 'title', `Level ${level.k}`), el('span', 'name', level.name));
    // A sample problem, set like the equation: digits, then the operator.
    const sample = el('span', 'sample');
    sample.setAttribute('aria-hidden', 'true');
    const [a, b] = level.sample;
    sample.append(el('span', null, String(a)), el('span', 'op', level.op), el('span', null, String(b)));
    // Its result, once it is finished (finished-mark spec §1): a check on
    // the title's line and the best time on the name's, shown in place of
    // the sample by showBests().
    const result = el('span', 'result');
    result.setAttribute('aria-hidden', 'true');
    result.innerHTML = CHECK;
    result.append(el('span', 'best'));
    row.append(txt, sample, result);
    row.insertAdjacentHTML('beforeend', LOCK);
    row.addEventListener('click', e => {
      const startedAt = e.detail && downAt != null ? downAt : e.timeStamp;
      downAt = null;
      if (startedAt >= pressableAt) choose(level);
    });
    rows.set(level, row);
    group.append(row);
  }

  // The Enter that made a third miss may still be held: its key repeat
  // (about 0.5s) would otherwise press a row as soon as it has focus.
  root.addEventListener('keydown', e => {
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
  });

  // Mark the level you came from, or none: aria-current for screen
  // readers; it shows only by taking the focus.
  function mark(level) {
    for (const [l, row] of rows) {
      row.classList.toggle('current', l === level);
      if (l === level) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    }
  }

  // The selector came up from `press`, a click if any: if it was a tap
  // (not a key, whose click has no detail), wait out its double tap.
  function cameFrom(press) {
    pressableAt = press?.detail ? press.timeStamp + DOUBLE_TAP_MS : -Infinity;
    downAt = null;
  }

  const bests = new Map();                   // level → its best as last shown
  // Show each level's result: a level with a best time, `best(n)` in ms
  // (null if none), is finished. Its row shows the check and that time,
  // and its name says so (finished-mark spec).
  function showBests(best) {
    for (const [level, row] of rows) {
      const ms = best(level.n);
      row.classList.toggle('finished', ms != null);
      row.querySelector('.best').textContent = ms == null ? '' : formatTime(ms);
      bests.set(level, ms);
      name(level, row);
    }
  }

  // Lock the levels `locked(level)` says (accounts spec §2): the lock in
  // place of the row's sample or result, and its name says so.
  function showLocks(locked) {
    for (const [level, row] of rows) {
      row.classList.toggle('locked', !!locked(level));
      name(level, row);
    }
  }
  function name(level, row) {
    const locked = row.classList.contains('locked');
    row.setAttribute('aria-label', locked ? lockedLabel(level) : rowLabel(level, bests.get(level)));
  }

  // A row reached by the keyboard shows with its whole ring too: the
  // browser's own focus scroll leaves no room for it.
  root.addEventListener('focusin', e => {
    const row = e.target.closest?.('.row');
    if (row && row.matches(':focus-visible')) reveal(root, row, CLEAR);
  });

  // Focus the marked row, so the keyboard carries on from there, and show
  // it and its focus ring, scrolling the list alone (reveal.js).
  function focus() {
    const row = root.querySelector('.row.current');
    if (!row) return;
    row.focus({ preventScroll: true });
    reveal(root, row, CLEAR);
  }

  // ---------- In topic columns (the topic-columns mockup, 2026-11-07) ----------

  // Where two or more tiles fit across, the list is a grid of topic
  // columns (gridFor()): one column a topic, its heading and then its
  // rows, the bands of topics --group-gap apart, so row N of every topic in
  // a band is at the same height and the headings share a line. Each tile
  // is its share of the width inside the page's sides (the header title's
  // inset: the gutter, or the safe-area inset where it is larger; the
  // larger side on both, as the grid is centred), from --tile-min up to
  // --tile-max (tileFor()). The grid is centred, its left edge on a whole
  // device pixel: under --tile-max its edges are the sides (the rounding's
  // leftover split between them); at --tile-max the tile stops growing and
  // the margins grow from the sides, smoothly, with the width. Fewer than
  // two fit (a phone): the one stacked column, as it always was, which may
  // scroll. The rows stay in the page in the order shown, so the keyboard
  // still goes topic by topic, row by row, and the focus is never lost.
  //
  // The room is the list's height less its padding at its least: the grid
  // fits if it fits there. The width is measured with no scrollbar (the
  // stacked column would scroll here even where the grid won't); where the
  // grid scrolls, again less the scrollbar's room, if it takes any, and the
  // tiles are counted and shared out from that.
  const BAND = 4;                            // columns a band, where the height allows
  let scrolls = false;                       // the grid can't fit, and scrolls
  function arrange() {
    const all = [...groups.children];
    const cs = getComputedStyle(root);
    const px = name => parseFloat(cs.getPropertyValue(name));
    root.classList.remove('cols');
    groups.style.marginLeft = '';
    scrolls = false;
    root.style.overflowY = 'hidden';
    const box = root.getBoundingClientRect();
    // The sides: where the header's title, "Levels", starts (its box, which
    // fitHeader() moves so its ink is on the page's edge), as far in on the
    // right where the right side is the larger.
    const title = document.querySelector('.top .crumbs .home');
    const edge = title?.getClientRects().length ? title.getBoundingClientRect().left - box.left : px('--side-left');
    const side = edge + Math.max(0, px('--side-right') - px('--side-left'));
    // The gap on a whole number of device pixels: 24px is one at 1x, 1.25x,
    // 1.5x, 2x and 3x, but not at 1.1x or 0.9x (a zoomed page).
    const dpr = devicePixelRatio;
    root.style.removeProperty('--col-gap');
    const gap = Math.round(px('--col-gap') * dpr) / dpr;
    const fits = client => Math.floor((client - 2 * side + gap) / (px('--tile-min') + gap));
    // Each topic's height, the same at any tile width (the rows are 80px).
    const heights = all.map(g => g.getBoundingClientRect().height);
    const room = box.height - px('--select-top-least') - px('--select-bottom-least');
    let grid = gridFor(heights, px('--group-gap'), room, fits(root.clientWidth), BAND);
    // A grid that scrolls has the scrollbar's room the less, which may take
    // a tile below --tile-min: then as many as fit beside it. Fewer columns
    // are no shorter, so it still scrolls.
    let client = root.clientWidth;
    if (grid?.scrolls) {
      root.style.overflowY = 'scroll';
      client = root.clientWidth;
      if (fits(client) < grid.cols) grid = gridFor(heights, px('--group-gap'), room, fits(client), BAND);
    }
    root.style.overflowY = '';
    if (!grid) return 1;
    scrolls = grid.scrolls;
    const n = grid.cols;
    const tile = tileFor(client - 2 * side, n, gap, px('--tile-max'), dpr);
    const left = Math.round((box.left + root.clientLeft + (client - (n * tile + (n - 1) * gap)) / 2) * dpr) / dpr;
    root.classList.add('cols');
    root.style.setProperty('--cols', n);
    root.style.setProperty('--tile', tile + 'px');
    root.style.setProperty('--col-gap', gap + 'px');
    groups.style.marginLeft = (left - groups.getBoundingClientRect().left) + 'px';
    return n;
  }

  // Then the padding gives way only by what it must (the UI reviews): the
  // top and the bottom by the same amount, the bottom no further than
  // --select-bottom-least and the top than --select-top-least, the other
  // then giving what is still needed; each to a whole device pixel rounded
  // down, so rows and padding never come out a hair too tall, and the first
  // headings stay on the device pixels the whole padding puts them on (the
  // header's foot is on one). Where the rows fit with it whole, or don't
  // fit at all (the list scrolls), the padding is whole; but a grid that
  // scrolls (a phone held sideways, many tall topics) starts at the least
  // top padding, so more of it shows. The one column keeps its whole
  // padding.
  function pad() {
    const cs = getComputedStyle(root);
    const px = name => parseFloat(cs.getPropertyValue(name));
    const [top, bottom, topLeast, bottomLeast] = ['--select-top', '--select-bottom', '--select-top-least', '--select-bottom-least'].map(px);
    root.style.paddingTop = root.style.paddingBottom = '';
    const height = root.getBoundingClientRect().height;
    const tallest = groups.getBoundingClientRect().height;
    const dpr = devicePixelRatio, spare = height - tallest, down = x => Math.floor(x * dpr + 1e-6) / dpr;
    let [above, below] = [top, bottom];
    if (spare < top + bottom && spare >= topLeast + bottomLeast) {
      below = Math.max(bottomLeast, down(bottom - (top + bottom - spare) / 2));
      above = down(spare - below);
      if (above < topLeast) [above, below] = [topLeast, down(spare - topLeast)];
    } else if (scrolls) above = topLeast;
    root.style.paddingTop = above === top ? '' : `${above}px`;
    root.style.paddingBottom = below === bottom ? '' : `${below}px`;
  }

  // The grid, then the padding. The padding never changes the grid: it
  // gives way only where the grid fits at the least padding, so the list
  // scrolls, and has a scrollbar, just where arrange() said it would. When
  // the number of columns changes, the focused row, if it is in the list,
  // is shown: the scroll position stays where it was, which may now leave
  // it out of sight.
  let laidOut = 0;                           // columns as last laid out
  function fit() {
    const n = arrange();
    pad();
    if (n !== laidOut) {
      laidOut = n;
      if (root.contains(document.activeElement)) reveal(root, document.activeElement, CLEAR);
    }
  }

  // ---------- On its ink (Level 2 spec §5, finished-mark spec §1) ----------

  // A text element's font as the scanner wants it, and its text as drawn.
  function textOf(node) {
    const cs = getComputedStyle(node);
    const fs = parseFloat(cs.fontSize);
    const style = { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: (parseFloat(cs.letterSpacing) || 0) / fs };
    return { fs, style, text: cs.textTransform === 'uppercase' ? node.textContent.toUpperCase() : node.textContent };
  }

  // Where a row's sample or result ends: its right padding edge.
  const rightEdge = row => row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight);

  // Move a label so its ink, not its box, starts at its left edge (a
  // heading's at the column's, a row's text at its padding). Its start goes
  // on a whole device pixel, where it is drawn exactly as scanned (small
  // text is drawn on whole pixels at 1x), as the breadcrumb's (header.js).
  // It is placed from where its box starts unmoved, so placing it again
  // changes nothing.
  function inkLeft(node) {
    const dpr = devicePixelRatio;
    node.style.marginLeft = '';
    const { fs, style, text } = textOf(node);
    const left = node.getBoundingClientRect().left;
    const at = snap(left + scan(text, style, fs * dpr).abl * fs, dpr);
    node.style.marginLeft = onLayoutGrid(at - left, dpr) + 'px';
  }

  // Move a finished row's time so its ink ends at `edge`, as inkLeft() does
  // on the left, by a relative offset. (Its check needs nothing: the check's
  // viewBox is cropped to its ink, so its box, at the padding edge, is its
  // ink.)
  function inkRight(node, edge) {
    const dpr = devicePixelRatio;
    node.style.left = '';
    const { fs, style, text } = textOf(node);
    const left = node.getBoundingClientRect().left;
    const at = snap(edge - scan(text, style, fs * dpr).abr * fs, dpr);
    node.style.left = onLayoutGrid(at - left, dpr) + 'px';
  }

  // A sample, set as the equation is (layout.js): the baseline from a probe,
  // the digit band from all ten digits' ink, each operator moved onto the
  // band's centre. Then the whole sample moves by relative offsets: a
  // transform would take it off the device pixels again. It moves down, so
  // the band's centre is the row's, with the baseline on a whole device
  // pixel. And across, so its last digit's ink ends at the row's right
  // padding edge, with each digit starting on a whole device pixel. It is
  // measured with its own offsets cleared, so placing it again changes
  // nothing.
  function placeSample(sample, row) {
    const dpr = devicePixelRatio;
    sample.style.removeProperty('--ink-dx');
    sample.style.removeProperty('--ink-dy');
    const { fs, style } = textOf(sample);
    const size = fs * dpr;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;display:block;height:1em;line-height:1;white-space:pre';
    probe.innerHTML = '0<span style="display:inline-block;width:0;height:0;vertical-align:baseline"></span>';
    sample.appendChild(probe);
    const base = (probe.lastChild.getBoundingClientRect().top - probe.getBoundingClientRect().top) / fs;
    probe.remove();
    const each = DIGITS.map(c => scan(c, style, size));
    const digits = band({ asc: Math.max(...each.map(m => m.asc)), desc: Math.max(...each.map(m => m.desc)) }, base);
    for (const op of sample.querySelectorAll('.op')) {
      const m = scan(op.textContent, { ...style, color: getComputedStyle(op).color }, size);
      op.style.top = (digits.mid - band(m, base).mid).toFixed(4) + 'em';
    }
    const r = row.getBoundingClientRect();
    const baseline = sample.getBoundingClientRect().top + base * fs;
    const wanted = snap(r.top + r.height / 2 + (base - digits.mid) * fs, dpr);
    sample.style.setProperty('--ink-dy', onLayoutGrid(wanted - baseline, dpr) + 'px');
    const last = sample.lastElementChild;
    const start = last.getBoundingClientRect().left;
    const at = snap(rightEdge(row) - scan(last.textContent, style, size).abr * fs, dpr);
    sample.style.setProperty('--ink-dx', onLayoutGrid(at - start, dpr) + 'px');
  }

  // The groups in their columns, then the labels, samples and finished
  // rows' times lined up on their ink, where the columns put them. It has
  // nothing to do while a level is played (the selector is hidden). What
  // is hidden, a finished row's sample or the others' results, waits for
  // the layout that shows it, after showBests().
  function layout() {
    if (!root.clientWidth) return;
    fit();
    const shown = node => node.getClientRects().length > 0;
    for (const node of root.querySelectorAll('.group-name, .title, .name')) inkLeft(node);
    for (const row of rows.values()) {
      const sample = row.querySelector('.sample'), best = row.querySelector('.best');
      if (shown(sample)) placeSample(sample, row);
      if (shown(best)) inkRight(best, rightEdge(row));
    }
  }

  return { mark, cameFrom, showBests, showLocks, focus, layout };
}
