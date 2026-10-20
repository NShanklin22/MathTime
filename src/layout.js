import { centreInk, band, snapOutward, snap, onLayoutGrid } from './ink.js';
import { fitHeader } from './header.js';
import { centreKeys } from './keypad.js';

const DIGITS = [...'0123456789'];

// A length in px, written exactly on the layout grid (see ink.js).
const px = v => onLayoutGrid(v, devicePixelRatio) + 'px';

// Measures the real ink of the equation's font and lays the screen out around
// it (spec §6.1): box, caret and operators from measured ink; equation fitted
// and snapped to device pixels; header fitted (header.js); keypad labels
// centred (keypad.js). `afterMeasure` runs once per layout, after the last
// measurement, so the view can re-render digits with the new geometry.
// `place` centres the equation on its ink, which depends on the problem: the
// view calls it again after drawing a new one.
export function createLayout(dom, scan, possibleAnswers) {
  const { eq, a, slot, caret, qnum, stage, topBar, pad } = dom;
  const geo = { fs: 0, style: null, base: 0.8, mid: 0.5, inkH: 0.72, boxW: 1.2, wide: 0.6 };
  const api = { geo, inkOf, leadIndent, caretLeft, layout, place, afterMeasure: null };

  // Ink geometry of `text` centred across `width` em, at the current size
  // (all zeros before the first measurement).
  function inkOf(text, width) {
    if (!geo.style) return { off: 0, right: 0, w: 0 };
    return centreInk(scan(text, geo.style, geo.fs * devicePixelRatio), width);
  }

  // How far into its cell the equation's first digit starts, as a CSS length:
  // ink-centred, then put on a whole device pixel (the equation's left edge
  // is on one). That is where the scan drew it, so its ink starts exactly
  // where measured, which centring relies on: at other fractions of a pixel
  // the page draws a glyph up to 0.4px off at 1x. It is at most half a device
  // pixel off its cell's centre.
  function leadIndent(digit) {
    return px(snap(inkOf(digit, geo.wide).off * geo.fs, devicePixelRatio));
  }

  // Where the caret goes, as a CSS length from the answer's origin: a fixed
  // gap after an answer whose ink ends `right` em into the box, or centred in
  // an empty box (`right` null). It is put on a whole device pixel (the
  // equation's left edge is on one), so it is drawn the same after every
  // digit, the gap true to half a device pixel.
  function caretLeft(right) {
    if (!geo.style) return '';
    const origin = caret.parentElement.getBoundingClientRect().left - eq.getBoundingClientRect().left;
    const x = right === null
      ? origin + (geo.boxW * geo.fs - geo.caretW) / 2
      : origin + right * geo.fs + Math.max(0.08 * geo.fs, 4);
    return px(snap(x, devicePixelRatio) - origin);
  }

  // Baseline position (em) inside a 1em, line-height 1 box, read from layout.
  function domBaseline() {
    const box = document.createElement('span');
    box.style.cssText = 'position:absolute;visibility:hidden;display:block;height:1em;line-height:1;white-space:pre';
    box.innerHTML = '0<span style="display:inline-block;width:0;height:0;vertical-align:baseline"></span>';
    eq.appendChild(box);
    const base = (box.lastChild.getBoundingClientRect().top - box.getBoundingClientRect().top) / geo.fs;
    box.remove();
    return base;
  }

  function measure() {
    const cs = getComputedStyle(eq);
    geo.fs = parseFloat(cs.fontSize);
    if (!(geo.fs > 0)) return;                 // nothing to measure
    geo.style = { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color };
    const size = geo.fs * devicePixelRatio;
    geo.base = domBaseline();
    // The digit ink band is the union of the ten digits. Fonts' "tabular"
    // digits can still differ in width, so a cell is the widest advance.
    const each = DIGITS.map(c => scan(c, geo.style, size));
    const digits = band({ asc: Math.max(...each.map(m => m.asc)), desc: Math.max(...each.map(m => m.desc)) }, geo.base);
    geo.mid = digits.mid;
    geo.inkH = digits.h;
    geo.wide = Math.max(...each.map(m => m.adv));
    geo.boxW = Math.max(...possibleAnswers.map(s => inkOf(s, 0).w));
    eq.style.setProperty('--fs', geo.fs + 'px');
    eq.style.setProperty('--ink-top', digits.top.toFixed(4));
    eq.style.setProperty('--ink-h', digits.h.toFixed(4));
    eq.style.setProperty('--wide', geo.wide.toFixed(4));
    eq.style.setProperty('--box-w', geo.boxW.toFixed(4));
    eq.style.setProperty('--bw', getComputedStyle(slot, '::after').borderTopWidth);
    // The outline is drawn a whole number of device pixels out from the box,
    // rounded down. Set exactly that, so centring knows where it is drawn.
    eq.style.removeProperty('--outline-offset');
    const offset = parseFloat(getComputedStyle(slot, '::after').outlineOffset) * devicePixelRatio;
    eq.style.setProperty('--outline-offset', Math.floor(offset + 1e-3) / devicePixelRatio + 'px');
    // The box padding in whole device pixels. The box's edges are drawn on
    // whole pixels, and with the baseline on one too, the padding then comes
    // out the same on all four sides.
    const pad = parseFloat(cs.getPropertyValue('--box-pad')) * geo.fs;
    eq.style.setProperty('--pad', px(snap(pad, devicePixelRatio)));
    const ops = [...eq.querySelectorAll('.op')].map(op => {
      const m = scan(op.textContent, { ...geo.style, color: getComputedStyle(op).color }, size);
      op.style.top = (digits.mid - band(m, geo.base).mid).toFixed(4) + 'em';
      return m;
    });
    // Even spacing (spec §3.2): the flex gap sits between side bearings, and
    // the box has none, so it gets a margin. With it, the ink gap from "=" to
    // the box is the mean of the ink gaps either side of the second number,
    // "+" → digit and digit → "=", over all ten digits. A digit is
    // ink-centred in its cell, so its bearing is half the cell's spare width.
    const plus = ops[0], equals = ops[ops.length - 1];
    const bearing = each.reduce((sum, m) => sum + (geo.wide - m.abl - m.abr) / 2, 0) / each.length;
    const around = bearing + (plus.adv - plus.abr - equals.abl) / 2;
    eq.style.setProperty('--slot-gap', (around - (equals.adv - equals.abr)).toFixed(4));
    // Centre the digits' ink, not the line box, in the problem area.
    eq.style.marginTop = ((0.5 - digits.mid) * 2).toFixed(4) + 'em';
    // The caret spans the digit ink, snapped outward to whole device pixels
    // around the (pixel-aligned) baseline, so it never comes up short.
    const cap = snapOutward((digits.top - geo.base) * geo.fs, (digits.top + digits.h - geo.base) * geo.fs, devicePixelRatio);
    caret.style.top = px(geo.base * geo.fs + cap.top);
    caret.style.height = px(cap.bottom - cap.top);
    // A whole number of device pixels wide, so it is drawn the same wherever it goes.
    geo.caretW = snap(Math.max(0.05 * geo.fs, 2), devicePixelRatio);
    caret.style.width = px(geo.caretW);
  }

  // The equation's box without its live transform. The shake and slide
  // animations move #eq with translateX, which must not leak into the
  // snapping. They only translate; a scale would only change the width,
  // which is divided out.
  function eqBox() {
    const r = eq.getBoundingClientRect();
    const tf = getComputedStyle(eq).transform;
    const t = tf === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(tf);
    return { left: r.left - t.m41, top: r.top - t.m42, width: r.width / t.a };
  }

  // The box's dashed construction outline sticks out round it, and the box is
  // last in the equation, so it sticks out on the right and below. Count it
  // when fitting and centring.
  function overhang() {
    const after = getComputedStyle(slot, '::after');
    return after.outlineStyle === 'none' ? 0 : parseFloat(after.outlineOffset) + parseFloat(after.outlineWidth);
  }

  // The box's px minimums from styles.css (each has an em size too, and the
  // larger wins), and how far they are scaled down (--line-scale).
  function minimums() {
    const cs = getComputedStyle(eq);
    const num = name => parseFloat(cs.getPropertyValue(name));
    return { bwEm: num('--bw-em'), bwMin: num('--bw-min'), outEm: num('--outline-em'), outMin: num('--outline-min') };
  }

  // How much the font must shrink (1 or more: not at all) for the equation to
  // be `across` px wide at most, outline included, and for "Question N"
  // (above) and the box's outline (below) to reach at most `room` px from the
  // digit ink's centre, which is the problem area's; and whether the label's
  // side is the one that decides. The label's px minimums shrink with the
  // font when it does (--label-scale). The box border and outline offset held
  // at their px minimums (scaled by `line`) and the outline's own width don't
  // shrink with the font: they are taken off at their design size. The page
  // draws them up to a device pixel finer, so the result still fits and moves
  // smoothly with the room.
  function fits(across, room, line) {
    const m = minimums();
    const after = getComputedStyle(slot, '::after');
    const bw = parseFloat(after.borderTopWidth);
    const offset = parseFloat(after.outlineOffset);
    const hair = parseFloat(after.outlineWidth);
    const bwHeld = m.bwEm * geo.fs < m.bwMin * line;
    const offsetHeld = m.outEm * geo.fs < m.outMin * line;
    // (A border is never drawn less than one device pixel wide.)
    const border = { now: bwHeld ? bw : 0, design: bwHeld ? Math.max(m.bwMin * line, 1 / devicePixelRatio) : 0 };
    const out = { now: (offsetHeld ? offset : 0) + hair, design: (offsetHeld ? m.outMin * line : 0) + hair };
    const width = eqBox().width + offset + hair;
    const w = (across - 2 * border.design - out.design) / (width - 2 * border.now - out.now);
    const mid = eq.getBoundingClientRect().top + geo.mid * geo.fs;
    const above = mid - qnum.getBoundingClientRect().top;
    const below = slot.getBoundingClientRect().top + parseFloat(after.top) + parseFloat(after.height) + offset + hair - mid;
    const ha = (room - border.design) / (above - border.now);
    const hb = (room - border.design - out.design) / (below - border.now - out.now);
    return { w, h: Math.min(ha, hb), label: ha <= hb };
  }

  // Shrink the equation to fit (spec §3.2): across, between the gutters;
  // down, with "Question N" and the box 8px clear of the problem area's
  // edges, either side of the centred digit ink. Each round takes the
  // tighter of the two; parts that keep their px size make a round fall a
  // little short, so there are up to four, each checked.
  // A problem area too short for 8px clear (under about 49px) shares out
  // what it has: the clearance and the box's px minimums shrink together,
  // so the whole group still fits and the font grows steadily with the area.
  // The font never goes under a device pixel; under about 3px nothing fits
  // at all, and it is left as it is.
  function fitSize() {
    const gutter = parseFloat(getComputedStyle(stage).getPropertyValue('--gutter'));   // 16px on phones
    const across = stage.clientWidth - 2 * gutter - 1;   // 1px slack for pixel snapping
    const half = stage.clientHeight / 2 - 0.5;           // 0.5px slack for pixel snapping
    const m = minimums();
    const hair = parseFloat(getComputedStyle(slot, '::after').outlineWidth);
    const line = Math.min(1, Math.max(0, (half - hair) / (m.bwMin + m.outMin + 16)));
    if (line < 1) {
      eq.style.setProperty('--line-scale', line.toFixed(4));
      measure();
    }
    const room = half - 8 * line;
    let labelScale = 1;
    for (let round = 0; round <= 4; round++) {
      const { w, h, label } = fits(across, room, line);
      const s = Math.min(w, h);
      if (s >= 1 - 1e-4 || round === 4 || !(s > 0)) break;   // fits, out of rounds, or nothing fits at all
      const shrinkLabel = h < w && label;
      if (shrinkLabel) {
        labelScale *= h;
        eq.style.setProperty('--label-scale', labelScale.toFixed(4));
      }
      const next = Math.max(geo.fs * s, 1 / devicePixelRatio);   // never under a device pixel
      if (next >= geo.fs && !shrinkLabel) break;
      eq.style.fontSize = next + 'px';
      measure();
    }
    if (labelScale < 1) fitLabel(room, labelScale);
  }

  // With the font settled, "Question N" as large as its side now allows: a
  // later round may have shrunk the font for the outline's side and left the
  // label room. Its reach grows with its px minimums along a convex line
  // (they are max()es), so stepping along the straight line to full size
  // never overshoots; a few steps close in.
  function fitLabel(room, k0) {
    const reach = k => {
      eq.style.setProperty('--label-scale', (Math.floor(k * 1e4) / 1e4).toFixed(4));
      return eq.getBoundingClientRect().top + geo.mid * geo.fs - qnum.getBoundingClientRect().top;
    };
    const r1 = reach(1);
    if (r1 <= room) {
      eq.style.removeProperty('--label-scale');
      return;
    }
    let k = k0, r = reach(k0);
    for (let i = 0; i < 3 && r < room - 0.01; i++) {
      k += (room - r) / (r1 - r) * (1 - k);
      r = reach(k);
    }
  }

  function layout() {
    fitHeader(topBar);                         // the header also shows on the level selector
    if (!stage.clientWidth) return;            // hidden (level selector showing)
    eq.style.fontSize = '';
    eq.style.left = '';
    eq.style.top = '';
    eq.style.removeProperty('--label-scale');
    eq.style.removeProperty('--line-scale');
    measure();
    fitSize();
    // Draw the problem and answer with the final geometry, then place them.
    api.afterMeasure?.();
    place();
    centreKeys(pad, scan);
  }

  // Place the equation for the problem on screen: what you see centred in
  // the problem area, "Question N" over it, the baseline on a whole device
  // pixel. Only a new problem changes the first digit, so the equation never
  // moves while you type or after a miss.
  function place() {
    if (!stage.clientWidth || !geo.style) return;
    eq.style.left = '';
    eq.style.top = '';
    const r = eqBox();
    placeLabel(centreGroup(r));
    const baseY = r.top + geo.base * geo.fs;
    eq.style.top = px(snap(baseY, devicePixelRatio) - baseY);
  }

  // Centre what you see of the equation, from the first digit's ink to the
  // box's dashed outline, in the problem area (spec §3.2), with the left edge
  // on a whole device pixel. `r` is the equation's unplaced box. Returns the
  // middle of what you see, from the equation's left edge.
  function centreGroup(r) {
    const dpr = devicePixelRatio;
    const s = stage.getBoundingClientRect();
    // Both ends from the equation's left edge, which lands on a device
    // pixel: the first digit's ink starts at the indent render() gave it, less
    // the ink's left bearing; the box is drawn on whole device pixels, the
    // outline round it.
    const cell = a.firstElementChild;
    const start = cell ? parseFloat(getComputedStyle(cell).textIndent) - scan(cell.textContent, geo.style, geo.fs * dpr).abl * geo.fs : 0;
    const end = snap(slot.getBoundingClientRect().right - eq.getBoundingClientRect().left, dpr) + overhang();
    const mid = (start + end) / 2;
    eq.style.left = px(snap(s.left + s.width / 2 - mid, dpr) - r.left);
    return mid;
  }

  // "Question N" over the middle `mid` (from the equation's left edge),
  // centred on its own ink: its trailing letter spacing and side bearings
  // would leave it off-centre. (Snapping its start to a device pixel, as for
  // the first digit, would trade its 0.1-0.2px for up to half a device pixel.)
  function placeLabel(mid) {
    const dpr = devicePixelRatio;
    const ls = getComputedStyle(qnum);
    const lfs = parseFloat(ls.fontSize);
    const style = { weight: ls.fontWeight, family: ls.fontFamily, color: ls.color, spacing: (parseFloat(ls.letterSpacing) || 0) / lfs };
    // Under a device pixel it shows nothing, and there is no ink to scan.
    const label = lfs * dpr >= 1 ? scan(qnum.textContent, style, lfs * dpr) : { abl: 0, abr: 0 };
    eq.style.setProperty('--label-x', px(mid + qnum.getBoundingClientRect().width / 2 - (label.abr - label.abl) / 2 * lfs));
  }

  return api;
}
