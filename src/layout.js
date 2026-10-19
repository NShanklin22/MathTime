import { centreInk, band, snapOutward, snap } from './ink.js';

// Measures the real ink of the equation's font and lays the screen out around
// it (spec §6.1): box, caret and operators from measured ink; equation fitted
// between the gutters and snapped to device pixels; header fitted; keypad
// labels centred. `afterMeasure` runs after every measurement so the view can
// re-render digits with the new geometry.
export function createLayout(dom, scan, possibleAnswers) {
  const { eq, slot, caret, stage, topBar } = dom;
  const geo = { fs: 0, style: null, base: 0.8, mid: 0.5, boxW: 1.2, wide: 0.6 };
  const api = { geo, inkOf, layout, afterMeasure: null };

  // Ink geometry of `text` centred across `width` em, at the current size.
  function inkOf(text, width) {
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
    const digits = band(scan('0123456789', geo.style, size), geo.base);
    geo.mid = digits.mid;
    // Fonts' "tabular" digits can still differ in width; use the widest.
    geo.wide = Math.max(...[...'0123456789'].map(c => scan(c, geo.style, size).adv));
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
    api.afterMeasure?.();
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
  // vertical shift is a whole number of device pixels too.
  function centreKeys() {
    const dpr = devicePixelRatio;
    for (const kl of document.querySelectorAll('.pad .kl')) {
      const kr = kl.parentElement.getBoundingClientRect();
      if (!kr.width) continue;
      kl.style.transform = 'none';
      const cs = getComputedStyle(kl);
      const kfs = parseFloat(cs.fontSize);
      const m = scan(kl.textContent, { weight: cs.fontWeight, family: cs.fontFamily }, kfs * dpr);
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      kl.appendChild(probe);
      const baseY = snap(probe.getBoundingClientRect().top, dpr);
      probe.remove();
      const lr = kl.getBoundingClientRect();
      const dy = snap(kr.top + kr.height / 2 - (baseY - (m.asc - m.desc) / 2 * kfs), dpr);
      const dx = kr.left + kr.width / 2 - (m.abr - m.abl) / 2 * kfs - lr.left;
      kl.style.transform = `translate(${dx.toFixed(3)}px, ${dy.toFixed(3)}px)`;
    }
  }

  function layout() {
    if (!stage.clientWidth) return;            // hidden (level selector showing)
    fitHeader();
    eq.style.fontSize = '';
    eq.style.left = '';
    eq.style.top = '';
    measure();
    const gutter = innerWidth <= 480 ? 16 : 24;
    const avail = stage.clientWidth - 2 * gutter - 1;   // 1px slack for pixel snapping
    for (let i = 0; i < 3; i++) {                       // the overhang scales with the font
      const width = eq.getBoundingClientRect().width + overhang();
      if (width <= avail) break;
      eq.style.fontSize = (geo.fs * avail / width) + 'px';
      measure();
    }
    // Baseline and left edge on whole device pixels; shift left by half the
    // overhang so the visible group (equation plus outline) is centred.
    const dpr = devicePixelRatio;
    const r = eq.getBoundingClientRect();
    eq.style.setProperty('--overhang', overhang() + 'px');
    eq.style.left = (snap(r.left - overhang() / 2, dpr) - r.left).toFixed(3) + 'px';
    const baseY = r.top + geo.base * geo.fs;
    eq.style.top = (snap(baseY, dpr) - baseY).toFixed(3) + 'px';
    centreKeys();
  }

  return api;
}
