import { snap, onLayoutGrid } from './ink.js';

// The feedback animations, for the answer box (view.js) and the column
// board (board.js) alike: the approved mockup's "New" mode
// (docs/superpowers/specs/2026-11-06-animations-mockup.html; ideas 1-3 in
// docs/superpowers/specs/2026-11-06-animation-ideas.md).
//
//   Inked over: on a right answer, a green pen line traces the answer's
//     frame clockwise from its top left corner (150ms), and its digits go
//     green as it closes. Then the frame's own border is green and the pen
//     goes.
//   In-place reprint: the closed green frame holds 90ms, the problem fades
//     out (80ms), the next one is drawn where it will sit and fades in
//     (120ms). Input is locked 320ms. Nothing moves.
//   Red-line: a wrong answer is struck through by a solid warm-red line
//     ~0.07em thick, drawn left to right (140ms), held (240ms) and cleared
//     with the struck digits (120ms). On the board an empty
//     cell that needed a digit has its frame drawn solid red instead, on
//     the same timing. Nothing moves.
//
// Only opacity, colour, stroke-dashoffset and clip-path change. A key
// the game takes jumps a red-line or a fade-in to its end at once (skip()), and a new
// layout jumps every effect to its end (settle()). Under
// prefers-reduced-motion the end states show at once: a wrong answer's
// strike shows still for 400ms, or until the next key.
//
// The overlays are SVGs laid over the page with position: fixed, so their
// edges are placed from the window's corner, which is on a whole device
// pixel: every edge of them is on one too, as the page paints the frame.

export const TIMING = {
  trace: 150, traceEase: 'cubic-bezier(.3,.1,.5,1)',
  digitsAt: 100, digits: 50,       // the digits go green as the pen closes the frame
  hold: 240, out: 80, in: 120,     // the fade out starts 90ms after the trace
  draw: 140, drawEase: 'cubic-bezier(.3,0,.4,1)', redHold: 240, clear: 120,
  still: 400,                      // the strike under reduced motion
};
export const LOCK_MS = TIMING.hold + TIMING.out;                          // 320
export const RED_MS = TIMING.draw + TIMING.redHold + TIMING.clear;        // 500

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVG = 'http://www.w3.org/2000/svg';
const px = v => onLayoutGrid(v, devicePixelRatio) + 'px';
const colour = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// The pen line over a frame whose border box is `r` (CSS px from the
// window's corner) and whose border is `bw` wide (a whole number of device
// pixels): one open path along the border's centre line, from the top left
// corner's outer edge, clockwise, closing over itself. The page paints the
// border box with its edges on whole device pixels, so the SVG covers
// exactly that. A border of whole device pixels (as the page draws one) is
// covered exactly: the pen is its width, on its centre line, from the
// start, with no overhang or soft fringe, so nothing changes weight when
// the border itself turns green. Only a border off the grid gets a pen
// that starts at most 2px and settles to its weight plus one device pixel,
// half each side, so the border's edges never show beside it.
export function penGeometry(r, bw, dpr) {
  const left = snap(r.left, dpr), top = snap(r.top, dpr);
  const w = snap(r.right, dpr) - left, h = snap(r.bottom, dpr) - top;
  const whole = Math.abs(bw * dpr - Math.round(bw * dpr)) < 1e-3;
  const c = bw / 2, e = whole ? 0 : 0.5 / dpr;
  return {
    left, top, w, h,
    d: `M${-e} ${c}H${w - c}V${h - c}H${c}V${-e}`,
    len: (w - c + e) + (h - 2 * c) + (w - 2 * c) + (h - c + e),
    from: whole ? bw : Math.min(2, bw), to: bw + 2 * e,
  };
}

// The strike through ink from x = left to right (CSS px), whose middle is
// at y = mid, in a font of `size` px: a line ~0.07em thick, 4px past the
// ink at each end, with a halo of the background's colour one device
// pixel round it, every edge on a whole device pixel. `ext` changes how far
// past the ink it goes; `inside` ({ left, right }) is where it must stay
// within, halo and all (a cell's frame, less a margin).
export function strikeGeometry({ left, right, mid, size, ext = 4, inside = null }, dpr) {
  const halo = 1 / dpr;
  let x0 = snap(left - ext, dpr), x1 = snap(right + ext, dpr);
  if (inside) {
    x0 = Math.max(x0, Math.ceil((inside.left + halo) * dpr - 1e-6) / dpr + 0);
    x1 = Math.min(x1, Math.floor((inside.right - halo) * dpr + 1e-6) / dpr + 0);
  }
  const sw = Math.max(1, Math.round(0.07 * size * dpr)) / dpr;
  const y0 = snap(mid - sw / 2, dpr);
  return { left: x0 - halo, top: y0 - halo, W: x1 - x0 + 2 * halo, H: sw + 2 * halo, sw, halo };
}

// An SVG overlay at (left, top), w × h, in CSS px from the window's corner.
function overlay(parent, cls, left, top, w, h) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `fx ${cls}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  Object.assign(svg.style, { left: px(left), top: px(top), width: px(w), height: px(h) });
  parent.append(svg);
  return svg;
}

// Start an animation on the clock: from the frame now shown, not the next
// one, however late that comes, so the effects keep their timings. (Not
// the fade-in: the next problem is measured and drawn just before it, which
// can take longer than a frame, so it starts fresh, from its first frame.)
function play(el, frames, opts) {
  const a = el.animate(frames, opts);
  const t = document.timeline.currentTime;
  if (t != null) a.startTime = t;
  return a;
}

// The effects playing for one screen. Each is { end, skip?, settle? }:
// end() takes it away; skip() (a key) and settle() (a new layout) take it
// to its end state at once.
export function createEffects() {
  const live = new Set();
  return {
    live,
    add(fx) { live.add(fx); return fx; },
    skip() { for (const fx of [...live]) fx.skip?.(); },
    settle() { for (const fx of [...live]) (fx.settle ?? fx.skip ?? fx.end)(); },
    clear() { for (const fx of [...live]) fx.end(); live.clear(); },
  };
}

// Inked over: the pen round frame `r` (border `bw`) inside `parent`, and
// `digits` going green, with `borders` ({ el, sides }: border colour
// properties of el, the dividers inside the frame) as they do. traced() is
// called as the trace ends (at once under reduced motion), to show the
// inked end state: the frame's own border and the digits green. The pen
// then goes.
export function inkOver(effects, { parent, r, bw, digits = [], borders = [], traced }) {
  const g = penGeometry(r, bw, devicePixelRatio);
  const anims = [];
  let svg = null, over = false;
  const tidy = () => { svg?.remove(); anims.forEach(a => a.cancel()); effects.live.delete(fx); };
  const finish = () => { if (over) return; over = true; tidy(); traced(); };
  const fx = { end() { over = true; tidy(); }, settle: finish };
  effects.add(fx);
  if (reducedMotion()) { finish(); return fx; }
  svg = overlay(parent, 'pen', g.left, g.top, g.w, g.h);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', g.d);
  path.style.strokeWidth = g.to;
  path.style.strokeDasharray = `${g.len} ${g.len}`;
  path.style.strokeDashoffset = g.len;
  svg.append(path);
  anims.push(play(path, [{ strokeDashoffset: g.len, strokeWidth: g.from }, { strokeDashoffset: 0, strokeWidth: g.to }],
    { duration: TIMING.trace, easing: TIMING.traceEase, fill: 'both' }));
  const from = colour('--ink'), to = colour('--good');
  const green = { delay: TIMING.digitsAt, duration: TIMING.digits, fill: 'both' };
  for (const el of digits) anims.push(play(el, [{ color: from }, { color: to }], green));
  for (const { el, sides } of borders) {
    const at = c => Object.fromEntries(sides.map(p => [p, c]));
    anims.push(play(el, [at(from), at(to)], green));
  }
  anims[0].finished.then(finish, () => {});
  return fx;
}

// Red-line: the strike `s` (strikeGeometry) inside `parent`, over `ghost`,
// a copy of the wrong digits laid over the cleared ones (or none), named
// `cell` for the tests. Drawn, held, and cleared with the ghost; or still
// for 400ms under reduced motion. A key clears it at once. ended() is
// called once it is gone.
export function redLine(effects, { parent, s, ghost = null, cell = '', ended = () => {} }) {
  const svg = overlay(parent, 'redline', s.left, s.top, s.W, s.H);
  if (cell) svg.dataset.cell = cell;
  const stroke = (cls, a, b, width) => {
    const line = document.createElementNS(SVG, 'line');
    if (cls) line.setAttribute('class', cls);
    line.setAttribute('x1', a); line.setAttribute('x2', b);
    line.setAttribute('y1', s.H / 2); line.setAttribute('y2', s.H / 2);
    line.setAttribute('stroke-width', width);
    svg.append(line);
  };
  stroke('halo', 0, s.W, s.H);
  stroke(null, s.halo, s.W - s.halo, s.sw);
  const anims = [];
  let timer = 0, over = false;
  const end = () => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    anims.forEach(a => a.cancel());
    svg.remove();
    ghost?.remove();
    effects.live.delete(fx);
    ended();
  };
  const fx = { end, skip: end };
  effects.add(fx);
  if (reducedMotion()) {
    timer = setTimeout(end, TIMING.still);
    return fx;
  }
  const fade = { delay: TIMING.draw + TIMING.redHold, duration: TIMING.clear, fill: 'both' };
  anims.push(play(svg, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], { duration: TIMING.draw, easing: TIMING.drawEase, fill: 'both' }));
  anims.push(play(svg, [{ opacity: 1 }, { opacity: 0 }], fade));
  if (ghost) anims.push(play(ghost, [{ opacity: 1 }, { opacity: 0 }], fade));
  anims[1].finished.then(end, () => {});
  return fx;
}

// Red frame: an empty cell that needed a digit (a carry or a borrow
// skipped, Level 7's tens), its frame drawn solid warm red `width` px wide
// inside the cell, over its own frame, on the red-line's timing: in as the line would draw
// (140ms), held, and faded (120ms); still for 400ms under reduced motion.
// A key ends it at once. Its own frame then shows again.
export function redFrame(effects, { cell, width, id = '', ended = () => {} }) {
  const frame = document.createElement('i');
  frame.className = 'redframe';
  frame.setAttribute('aria-hidden', 'true');
  if (id) frame.dataset.cell = id;
  frame.style.borderWidth = px(width);
  cell.append(frame);
  const anims = [];
  let timer = 0, over = false;
  const end = () => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    anims.forEach(a => a.cancel());
    frame.remove();
    effects.live.delete(fx);
    ended();
  };
  const fx = { end, skip: end };
  effects.add(fx);
  if (reducedMotion()) {
    timer = setTimeout(end, TIMING.still);
    return fx;
  }
  anims.push(play(frame, [{ opacity: 0, offset: 0 }, { opacity: 1, offset: TIMING.draw / RED_MS }, { opacity: 1, offset: (TIMING.draw + TIMING.redHold) / RED_MS }, { opacity: 0, offset: 1 }],
    { duration: RED_MS, fill: 'both' }));
  anims[0].finished.then(end, () => {});
  return fx;
}

// The reprint's fade out of `el` (80ms), as the animation 'out', or none
// under reduced motion. It holds its end until cancelled.
export function fadeOut(el) {
  if (reducedMotion()) return null;
  return play(el, [{ opacity: 1 }, { opacity: 0 }], { id: 'out', duration: TIMING.out, fill: 'forwards' });
}

// The reprint's fade in of `el` (120ms), the next problem already where it
// sits; `el` has the class "in" meanwhile. A key or a layout ends it at once.
export function fadeIn(effects, el) {
  if (reducedMotion()) return;
  el.classList.add('in');
  const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { id: 'in', duration: TIMING.in, fill: 'both' });
  const end = () => { a.cancel(); el.classList.remove('in'); effects.live.delete(fx); };
  const fx = effects.add({ end, skip: end });
  a.finished.then(end, () => {});
}

// Cancel what this module started on `el` and inside it, leaving CSS
// animations and transitions (the caret's blink) alone.
export function cancelOn(el) {
  for (const a of el.getAnimations({ subtree: true })) {
    if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) a.cancel();
  }
}
