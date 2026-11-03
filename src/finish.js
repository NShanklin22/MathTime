import { snap, onLayoutGrid } from './ink.js';
import { reveal } from './reveal.js';

// The finish screen (runs spec §3).

// A time as m:ss.s. Tenths are cut, not rounded, as a stopwatch does: it
// never shows a time that hasn't been reached.
export function formatTime(ms) {
  const tenths = Math.floor(ms / 100);
  const seconds = (tenths % 600) / 10;
  return `${Math.floor(tenths / 600)}:${seconds.toFixed(1).padStart(4, '0')}`;
}

// What the finish screen says for a run of Level `n` that took `totalMs`
// with `misses` misses, against `best`: the fastest earlier run's time, or
// null if there is none. Only a faster run is a new best, not a tie; the
// first run has nothing to beat, so it is one. `said` is what screen
// readers hear.
export function finishText(n, totalMs, misses, best) {
  const time = formatTime(totalMs);
  const isNew = best === null || totalMs < best;
  const was = isNew ? '' : formatTime(best);
  return {
    title: `Level ${n} complete`,
    time,
    best: isNew ? 'New best' : `Best ${was}`,
    isNew,
    misses: misses === 0 ? 'No misses' : misses === 1 ? '1 miss' : `${misses} misses`,
    said: `Level ${n} complete. ${time}, ${isNew ? 'new best' : `best ${was}`}.`,
  };
}

// The screen in `root` (index.html): its lines, and two buttons that call
// again() and levels(), each with its click.
export function createFinish(root, scan, { again, levels }) {
  const $ = sel => root.querySelector(sel);
  const buttons = $('.done-buttons');
  const againButton = $('.again');
  againButton.addEventListener('click', again);
  $('.levels').addEventListener('click', levels);

  // The Enter of the last answer may still be held: its key repeat (about
  // 0.5s) would otherwise press "Again" as soon as it has focus.
  root.addEventListener('keydown', e => {
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
  });

  // Fill in the lines from finishText().
  function show(text) {
    $('.done-title').textContent = text.title;
    $('.done-time').textContent = text.time;
    $('.done-best').textContent = text.best;
    $('.done-best').classList.toggle('new', text.isNew);
    $('.done-misses').textContent = text.misses;
  }

  // "Again" has the focus, so Enter starts a new run. On a short screen the
  // column scrolls just far enough to show it and its focus ring.
  function focus() {
    againButton.focus({ preventScroll: true });
    reveal(root, againButton);
  }

  // Each line's ink centred in the column, and each button's label in its
  // button. A line is centred by its advance, and its side bearings and
  // letter spacing would leave the ink off-centre. Its start goes on a
  // whole device pixel, where it is drawn exactly as scanned (small text is
  // drawn on whole pixels at 1x), so the ink is within half a device pixel
  // of the centre. The centre is the buttons' row for the column's lines
  // (it fills what the column has inside its padding and any scrollbar),
  // and the button for its label. Not the line's own box: it is centred by
  // auto margins, which the page rounds to its layout grid, so its centre
  // can be a fraction of a pixel off.
  // All the reads happen in one pass, between the writes.
  // Run it while the screen shows, after every layout.
  function place() {
    const dpr = devicePixelRatio;
    const lines = [...root.querySelectorAll('.line')].filter(line => line.textContent);
    lines.forEach(line => { line.style.translate = ''; });
    const found = lines.map(line => {
      const cs = getComputedStyle(line);
      const fs = parseFloat(cs.fontSize);
      const style = { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: (parseFloat(cs.letterSpacing) || 0) / fs };
      const frame = (line.parentElement === root ? buttons : line.parentElement).getBoundingClientRect();
      return { box: line.getBoundingClientRect(), mid: frame.left + frame.width / 2, fs, m: scan(line.textContent, style, fs * dpr) };
    });
    lines.forEach((line, i) => {
      const { box, mid, fs, m } = found[i];
      const start = mid - (m.abr - m.abl) / 2 * fs;   // the start that centres the ink
      line.style.translate = onLayoutGrid(snap(start, dpr) - box.left, dpr) + 'px';
    });
  }

  return { show, focus, place };
}
