import { reveal } from './reveal.js';
import { formatTime } from './finish.js';

// How long after a tap its double tap can still come.
const DOUBLE_TAP_MS = 400;

// A level row's accessible name: the level, and once it is finished, its
// best time `bestMs` (finished-mark spec §4). null is unfinished; 0 is a time.
export function rowLabel(level, bestMs) {
  const label = `Level ${level.n}: ${level.name}`;
  return bestMs == null ? label : `${label}. Finished, best ${formatTime(bestMs)}.`;
}

// The level selector (Level 2 spec §3): a row per built level, grouped by
// topic in route order, each a button that calls choose(level). The level
// you came from is marked with an amber bar and gets the focus.
export function createSelector(root, levels, choose) {
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
  for (const level of levels) {
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
    row.append(txt, sample);
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

  // Focus the marked row, so the keyboard carries on from there, and show
  // it and its focus ring, scrolling the list alone (reveal.js).
  function focus() {
    const row = root.querySelector('.row.current');
    if (!row) return;
    row.focus({ preventScroll: true });
    reveal(root, row);
  }

  return { mark, cameFrom, focus };
}
