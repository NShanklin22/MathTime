import { reveal } from './reveal.js';
import { formatTime } from './finish.js';
import { band, snap, onLayoutGrid } from './ink.js';

const DIGITS = [...'0123456789'];

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

// The keypad's check (index.html), its viewBox cropped to its ink.
const CHECK = '<svg class="tick" viewBox="2 5 20 14.5"><path d="M3.5 12.5l5.5 5.5l11.5-11.5"/></svg>';

// The levels in the order the selector shows them (Levels 6–7 batch plan):
// grouped by topic, the topics in the order each first comes in `levels`
// (route order), and each topic's levels in route order. So Level 6,
// column addition, joins Level 1 under Addition, as its "Level 2".
export function byTopic(levels) {
  const topics = [...new Set(levels.map(level => level.topic))];
  return topics.flatMap(topic => levels.filter(level => level.topic === topic));
}

// The topic groups in columns (incident 2026-11-05): groups `heights` tall,
// in order, `gap` apart within a column, go into the fewest columns whose
// tallest fits in `room`, and no more than `most` (but always one, and
// never more than there are groups). The columns take the groups in order,
// never splitting one, and the tallest column is as short as it can be.
// Where no number of columns up to `most` fits, it is the fewest that are
// as short as any of them, and the list scrolls. Of the splits that short,
// each column in turn takes as many groups as it can, leaving one for each
// column after it, as a column of text fills. Returns the index of the
// group each column starts with.
export function columnsFor(heights, gap, room, most) {
  const count = heights.length;
  if (!count) return [];
  // Groups `from` to `to` - 1 in one column.
  const tall = (from, to) => heights.slice(from, to).reduce((sum, h) => sum + h, gap * (to - from - 1));
  // The shortest the tallest column can be, the groups from `from` on in
  // `n` columns. Each answer is kept: every split shares them.
  const kept = new Map();
  const least = (from, n) => {
    if (n === 1) return tall(from, count);
    const key = from * (count + 1) + n;
    if (!kept.has(key)) {
      let found = Infinity;
      for (let to = from + 1; to <= count - n + 1; to++) found = Math.min(found, Math.max(tall(from, to), least(to, n - 1)));
      kept.set(key, found);
    }
    return kept.get(key);
  };
  const widest = Math.min(Math.max(1, most), count);
  let n = 1, tallest = least(0, 1);
  for (let m = 2; m <= widest && tallest > room; m++) {
    const t = least(0, m);
    if (t < tallest || t <= room) [n, tallest] = [m, t];
  }
  // Each column as full as `tallest` lets it be.
  const starts = [];
  for (let c = 0, from = 0; c < n; c++) {
    starts.push(from);
    let to = from + 1;
    while (to < count - (n - c - 1) && (c === n - 1 || tall(from, to + 1) <= tallest)) to++;
    from = to;
  }
  return starts;
}

// The level selector (Level 2 spec §3): a row per built level, grouped by
// topic (byTopic()), each a button that calls choose(level). The rows are
// in the page in the order shown, so the keyboard follows them. The level
// you came from gets the focus (and aria-current). layout()
// puts the groups in as many columns as the window needs (fit()), then
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
  // The groups' own box, which fit() sets in columns.
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

  // ---------- In columns (incident 2026-11-05) ----------

  // Where one column of groups is taller than the list's room, they flow
  // into as few columns as fit, as many as the width takes (columnsFor()):
  // side by side, each the one column's width (--select-column), the gap
  // between groups (--group-gap) apart, the list as wide as they are and
  // centred as the one column is. The width takes n columns when what you
  // see of them, their rows, n × --select-column + (n − 1) × --group-gap,
  // fits inside the page's sides, as the header's text does: the gutter, or
  // the safe-area inset where it is larger (--side-left, --side-right). The
  // list's own padding, which shows nothing, may run into them. The columns
  // are centred, so the larger side counts on both. One column is always
  // allowed. They are CSS columns on the groups' box, so nothing moves in
  // the page: the keyboard still goes group by group, row by row, and the
  // focus is never lost. A group that starts a column breaks before it and
  // has no top margin there. Where one column fits, it is left as it always
  // was: not a column box at all.
  //
  // The room is the list's height less its padding at its least: the rows
  // fit if they fit there. Then the padding gives way only by what it must
  // (the UI reviews): the top and the bottom by the same amount, the bottom
  // no further than --select-bottom-least and the top than
  // --select-top-least, the other then giving what is still needed; each to
  // a whole device pixel rounded down, so rows and padding never come out a
  // hair too tall, and the first headings stay on the device pixels the
  // whole padding puts them on (the header's foot is on one).
  // Where the rows fit with it whole, or don't fit at all (the list
  // scrolls), the padding is whole.
  //
  // When the number of columns changes, the focused row, if it is in the
  // list, is shown: the scroll position stays where it was, which may now
  // leave it out of sight.
  let laidOut = 0;                           // columns as last laid out
  function fit() {
    const all = [...groups.children];
    const cs = getComputedStyle(root);
    const px = name => parseFloat(cs.getPropertyValue(name));
    const column = px('--select-column'), gap = px('--group-gap');
    const side = Math.max(px('--side-left'), px('--side-right'));
    const [top, bottom, topLeast, bottomLeast] = ['--select-top', '--select-bottom', '--select-top-least', '--select-bottom-least'].map(px);
    // The width the rows may take: the list's own with no max-width (the
    // window's), less the page's sides.
    root.style.maxWidth = 'none';
    const width = root.getBoundingClientRect().width - 2 * side;
    root.style.maxWidth = '';
    const height = root.getBoundingClientRect().height;
    const most = Math.floor((width + gap) / (column + gap));
    const heights = all.map(g => g.getBoundingClientRect().height);
    const starts = columnsFor(heights, gap, height - topLeast - bottomLeast, most);
    all.forEach((g, i) => g.classList.toggle('column-start', i > 0 && starts.includes(i)));
    if (starts.length > 1) {
      root.style.setProperty('--columns', starts.length);
      groups.style.columnCount = starts.length;
    } else {
      root.style.removeProperty('--columns');
      groups.style.columnCount = '';
    }
    // The padding: what the tallest column leaves of the height.
    const tallest = Math.max(...starts.map((from, c) => {
      const to = starts[c + 1] ?? all.length;
      return heights.slice(from, to).reduce((sum, h) => sum + h, gap * (to - from - 1));
    }));
    const dpr = devicePixelRatio, spare = height - tallest, down = x => Math.floor(x * dpr + 1e-6) / dpr;
    let [above, below] = [top, bottom];
    if (spare < top + bottom && spare >= topLeast + bottomLeast) {
      below = Math.max(bottomLeast, down(bottom - (top + bottom - spare) / 2));
      above = down(spare - below);
      if (above < topLeast) [above, below] = [topLeast, down(spare - topLeast)];
    }
    root.style.paddingTop = above === top ? '' : `${above}px`;
    root.style.paddingBottom = below === bottom ? '' : `${below}px`;
    if (starts.length !== laidOut) {
      laidOut = starts.length;
      if (root.contains(document.activeElement)) reveal(root, document.activeElement);
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

  return { mark, cameFrom, showBests, focus, layout };
}
