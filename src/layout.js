import { centreInk, band, snapOutward, snap } from './ink.js';

const DIGITS = [...'0123456789'];

// Measures the real ink of the equation's font and lays the screen out around
// it (spec §6.1): box, caret and operators from measured ink; equation fitted
// between the gutters and snapped to device pixels; header fitted; keypad
// labels centred. `afterMeasure` runs once per layout, after the last
// measurement, so the view can re-render digits with the new geometry.
export function createLayout(dom, scan, possibleAnswers) {
  const { eq, slot, caret, stage, topBar } = dom;
  const geo = { fs: 0, style: null, base: 0.8, mid: 0.5, boxW: 1.2, wide: 0.6 };
  const api = { geo, inkOf, layout, afterMeasure: null };

  // Ink geometry of `text` centred across `width` em, at the current size
  // (all zeros before the first measurement).
  function inkOf(text, width) {
    if (!geo.style) return { off: 0, right: 0, w: 0 };
    return centreInk(scan(text, geo.style, geo.fs * devicePixelRatio), width);
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
    geo.style = { weight: cs.fontWeight, family: cs.fontFamily };
    const size = geo.fs * devicePixelRatio;
    geo.base = domBaseline();
    // The digit ink band is the union of the ten digits. Fonts' "tabular"
    // digits can still differ in width, so a cell is the widest advance.
    const each = DIGITS.map(c => scan(c, geo.style, size));
    const digits = band({ asc: Math.max(...each.map(m => m.asc)), desc: Math.max(...each.map(m => m.desc)) }, geo.base);
    geo.mid = digits.mid;
    geo.wide = Math.max(...each.map(m => m.adv));
    geo.boxW = Math.max(...possibleAnswers.map(s => inkOf(s, 0).w));
    eq.style.setProperty('--fs', geo.fs + 'px');
    eq.style.setProperty('--ink-top', digits.top.toFixed(4));
    eq.style.setProperty('--ink-h', digits.h.toFixed(4));
    eq.style.setProperty('--wide', geo.wide.toFixed(4));
    eq.style.setProperty('--box-w', geo.boxW.toFixed(4));
    eq.style.setProperty('--bw', getComputedStyle(slot, '::after').borderTopWidth);
    for (const op of eq.querySelectorAll('.op')) {
      const opMid = band(scan(op.textContent, geo.style, size), geo.base).mid;
      op.style.top = (digits.mid - opMid).toFixed(4) + 'em';
    }
    // Centre the digits' ink, not the line box, in the problem area.
    eq.style.marginTop = ((0.5 - digits.mid) * 2).toFixed(4) + 'em';
    // The caret spans the digit ink, snapped outward to whole device pixels
    // around the (pixel-aligned) baseline, so it never comes up short.
    const cap = snapOutward((digits.top - geo.base) * geo.fs, (digits.top + digits.h - geo.base) * geo.fs, devicePixelRatio);
    caret.style.top = (geo.base * geo.fs + cap.top).toFixed(3) + 'px';
    caret.style.height = (cap.bottom - cap.top).toFixed(3) + 'px';
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

  // The box is last in the equation, so its dashed construction outline
  // sticks out on the right. Count it when fitting and centring.
  function overhang() {
    const after = getComputedStyle(slot, '::after');
    return after.outlineStyle === 'none' ? 0 : parseFloat(after.outlineOffset) + parseFloat(after.outlineWidth);
  }

  // Drop breadcrumb parts from the left until the header fits on one line.
  function fitHeader() {
    topBar.classList.remove('tight', 'tighter');
    const where = topBar.querySelector('.where');
    const crumbs = topBar.querySelector('.crumbs');
    if (crumbs.scrollWidth > where.clientWidth) topBar.classList.add('tight');
    if (crumbs.scrollWidth > where.clientWidth) topBar.classList.add('tighter');
  }

  // Centre each digit key's label on its real ink. Labels are much smaller
  // than the equation and snap to pixels differently, so each is scanned at
  // its own device size. Text baselines snap to whole device pixels, so the
  // vertical shift is a whole number of device pixels too. A pressed key is
  // scaled down, so its label keeps its last position. All the reads happen
  // in one pass, between the writes.
  function centreKeys() {
    const dpr = devicePixelRatio;
    const labels = [...document.querySelectorAll('.pad .kl')].filter(kl => {
      const key = kl.parentElement;
      return key.getBoundingClientRect().width && !key.classList.contains('pressed') && !key.matches(':active');
    });
    const probes = labels.map(kl => {
      kl.style.transform = 'none';
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      kl.appendChild(probe);
      return probe;
    });
    const found = labels.map((kl, i) => {
      const cs = getComputedStyle(kl);
      return {
        key: kl.parentElement.getBoundingClientRect(),
        label: kl.getBoundingClientRect(),
        baseY: snap(probes[i].getBoundingClientRect().top, dpr),
        kfs: parseFloat(cs.fontSize),
        style: { weight: cs.fontWeight, family: cs.fontFamily },
      };
    });
    probes.forEach(probe => probe.remove());
    labels.forEach((kl, i) => {
      const { key, label, baseY, kfs, style } = found[i];
      const m = scan(kl.textContent, style, kfs * dpr);
      const dy = snap(key.top + key.height / 2 - (baseY - (m.asc - m.desc) / 2 * kfs), dpr);
      const dx = key.left + key.width / 2 - (m.abr - m.abl) / 2 * kfs - label.left;
      kl.style.transform = `translate(${dx.toFixed(3)}px, ${dy.toFixed(3)}px)`;
    });
  }

  function layout() {
    fitHeader();                               // the header also shows on the level selector
    if (!stage.clientWidth) return;            // hidden (level selector showing)
    eq.style.fontSize = '';
    eq.style.left = '';
    eq.style.top = '';
    measure();
    const gutter = innerWidth <= 480 ? 16 : 24;
    const avail = stage.clientWidth - 2 * gutter - 1;   // 1px slack for pixel snapping
    for (let i = 0; i < 3; i++) {                       // the overhang scales with the font
      const width = eqBox().width + overhang();
      if (width <= avail) break;
      eq.style.fontSize = (geo.fs * avail / width) + 'px';
      measure();
    }
    // Draw the problem and answer with the final geometry, then place the
    // equation: baseline and left edge on whole device pixels, shifted left
    // by half the overhang so the visible group (equation plus outline) is
    // centred.
    api.afterMeasure?.();
    const dpr = devicePixelRatio;
    const r = eqBox();
    eq.style.setProperty('--overhang', overhang() + 'px');
    eq.style.left = (snap(r.left - overhang() / 2, dpr) - r.left).toFixed(3) + 'px';
    const baseY = r.top + geo.base * geo.fs;
    eq.style.top = (snap(baseY, dpr) - baseY).toFixed(3) + 'px';
    centreKeys();
  }

  return api;
}
