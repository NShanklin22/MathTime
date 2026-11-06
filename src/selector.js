import { reveal } from './reveal.js';
import { formatTime } from './finish.js';
import { band, snap, onLayoutGrid } from './ink.js';

const DIGITS = [...'0123456789'];

// How long after a tap its double tap can still come.
const DOUBLE_TAP_MS = 400;

// A level row's accessible name: the level, and once it is finished, its
// best time `bestMs` (finished-mark spec §4). null is unfinished; 0 is a time.
export function rowLabel(level, bestMs) {
  const label = `Level ${level.n}: ${level.name}`;
  return bestMs == null ? label : `${label}. Finished, best ${formatTime(bestMs)}.`;
}

// The keypad's check (index.html), its viewBox cropped to its ink.
const CHECK = '<svg class="tick" viewBox="2 5 20 14.5"><path d="M3.5 12.5l5.5 5.5l11.5-11.5"/></svg>';

// The levels in the order the selector shows them (Levels 6–7 batch plan):
// grouped by topic, the topics in the order each first comes in `levels`
// (route order), and each topic's levels in route order. So Level 6,
// column addition, joins Level 1 under Addition.
export function byTopic(levels) {
  const topics = [...new Set(levels.map(level => level.topic))];
  return topics.flatMap(topic => levels.filter(level => level.topic === topic));
}

// The level selector (Level 2 spec §3): a row per built level, grouped by
// topic (byTopic()), each a button that calls choose(level). The rows are
// in the page in the order shown, so the keyboard follows them. The level
// you came from is marked with an amber bar and gets the focus. layout()
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
  let group = null;
  for (const level of byTopic(levels)) {
    if (group?.dataset.topic !== level.topic) {
      group = el('section', 'group');
      group.dataset.topic = level.topic;
      group.append(el('h2', 'group-name', level.topic));
      root.append(group);
    }
    const row = el('button', 'row');
    row.dataset.level = level.n;
    row.setAttribute('aria-label', rowLabel(level, null));
    const txt = el('span', 'txt');
    txt.append(el('span', 'title', `Level ${level.n}`), el('span', 'name', level.name));
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

  // Mark the level you came from, or none: the amber bar, and aria-current
  // for screen readers.
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

  // Show each level's result: a level with a best time, `best(n)` in ms
  // (null if none), is finished. Its row shows the check and that time,
  // and its name says so (finished-mark spec).
  function showBests(best) {
    for (const [level, row] of rows) {
      const ms = best(level.n);
      row.classList.toggle('finished', ms != null);
      row.querySelector('.best').textContent = ms == null ? '' : formatTime(ms);
      row.setAttribute('aria-label', rowLabel(level, ms));
    }
  }

  // A row reached by the keyboard shows with its whole ring too: the
  // browser's own focus scroll leaves no room for it.
  root.addEventListener('focusin', e => {
    const row = e.target.closest?.('.row');
    if (row && row.matches(':focus-visible')) reveal(root, row);
  });

  // Focus the marked row, so the keyboard carries on from there, and show
  // it and its focus ring, scrolling the list alone (reveal.js).
  function focus() {
    const row = root.querySelector('.row.current');
    if (!row) return;
    row.focus({ preventScroll: true });
    reveal(root, row);
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

  // Line the labels, samples and finished rows' times up on their ink. It
  // has nothing to do while a level is played (the selector is hidden). What
  // is hidden, a finished row's sample or the others' results, waits for
  // the layout that shows it, after showBests().
  function layout() {
    if (!root.clientWidth) return;
    const shown = node => node.getClientRects().length > 0;
    for (const node of root.querySelectorAll('.group-name, .title, .name')) inkLeft(node);
    for (const row of rows.values()) {
      const sample = row.querySelector('.sample'), best = row.querySelector('.best');
      if (shown(sample)) placeSample(sample, row);
      if (shown(best)) inkRight(best, rightEdge(row));
    }
  }

  return { mark, cameFrom, showBests, focus, layout };
}
