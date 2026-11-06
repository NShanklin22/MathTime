import { onLayoutGrid, snap } from './ink.js';
import { LEVELS, levelName } from './levels.js';

// The header (spec §3.1, Level 2 spec §4).

// A text element's font as the scanner wants it.
function fontOf(el) {
  const cs = getComputedStyle(el);
  const fs = parseFloat(cs.fontSize);
  return { fs, style: { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: (parseFloat(cs.letterSpacing) || 0) / fs } };
}

// A crumb's ink, from its box's left edge, in px: where it starts and where
// it ends. The back chevron's from its path, which has round caps and joins
// (styles.css), so its ink is the path's box and half its stroke all round;
// a word's, scanned.
function inkOf(el, scan) {
  const chevron = el.querySelector('.chevron');
  if (chevron?.getClientRects().length) {
    const path = chevron.querySelector('path');
    const box = path.getBBox(), view = chevron.viewBox.baseVal;
    const half = parseFloat(getComputedStyle(path).strokeWidth) / 2;
    const r = chevron.getBoundingClientRect(), scale = r.width / view.width;
    const at = r.left - el.getBoundingClientRect().left;
    return { left: at + (box.x - half - view.x) * scale, right: at + (box.x + box.width + half - view.x) * scale };
  }
  const { fs, style } = fontOf(el);
  const m = scan(el.textContent, style, fs * devicePixelRatio);
  return { left: -m.abl * fs, right: m.abr * fs };
}

// The widest of the names the levels are shown by ("Multiplication 1"),
// in the level crumb's font, by its advance with the letter spacing: the
// whole breadcrumb must fit with it for any level to show it whole.
let ctx = null;
function widestName(here) {
  ctx ??= document.createElement('canvas').getContext('2d');
  const cs = getComputedStyle(here);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const spacing = parseFloat(cs.letterSpacing) || 0;
  const width = name => ctx.measureText(name).width + spacing * [...name].length;
  return LEVELS.map(levelName).reduce((widest, name) => (width(name) > width(widest) ? name : widest));
}

// The breadcrumb's form is the window's, not the level's (the UI review):
// if the whole of it, laid out with the widest of all levels' names,
// "Levels › Multiplication 1", doesn't fit on one line beside the hearts,
// the header is tight, for every level, on the play screen and the finish
// screen alike (which keeps the hearts' room): the way back shrinks to its
// chevron, "‹ Addition 1" (styles.css). The level is always whole.
// Then line the first crumb's ink up with the header's edge, as the hearts'
// ink ends at the other edge: its left side bearing, or the chevron's ink
// starting inside its box, would leave it inside. Its start goes on a whole
// device pixel, where it is drawn exactly as scanned (small text is drawn
// on whole pixels at 1x), so the ink is within half a device pixel of the
// edge; or, where the edge is a notch's safe-area inset, within one, never
// past it. Last, the word's underline, now that it is in place; the
// chevron has none.
export function fitHeader(topBar, scan) {
  topBar.classList.remove('tight');
  const where = topBar.querySelector('.where');
  const crumbs = topBar.querySelector('.crumbs');
  const here = crumbs.querySelector('.here');
  crumbs.style.marginLeft = '';
  // Measured to the fraction of a pixel: scrollWidth rounds, and would let
  // the level run up to half a pixel past its room.
  const shown = here.textContent;
  here.textContent = widestName(here);
  const tight = here.getBoundingClientRect().right > where.getBoundingClientRect().right + 0.001;
  here.textContent = shown;
  topBar.classList.toggle('tight', tight);
  const first = [...crumbs.children].find(el => el.getClientRects().length);
  if (!first?.textContent) return;
  const dpr = devicePixelRatio;
  const edge = where.getBoundingClientRect().left;
  const inset = edge > parseFloat(getComputedStyle(topBar).getPropertyValue('--gutter')) + 0.01;
  const start = edge - inkOf(first, scan).left;   // the start that puts the ink on the edge
  const at = inset ? Math.ceil(start * dpr - 1e-6) / dpr : snap(start, dpr);
  crumbs.style.marginLeft = onLayoutGrid(at - edge, dpr) + 'px';
  if (first.classList.contains('back') && !tight) underline(first, scan);
}

// The way back's underline (Level 2 spec §4), from the first ink of
// "Levels" to its last and 4px below its baseline, all on whole device
// pixels. The ends come from its scanned ink (inkOf). The baseline comes
// from a probe, put on a whole device pixel as the page draws it
// (keypad.js).
function underline(link, scan) {
  const dpr = devicePixelRatio;
  const ink = inkOf(link, scan);
  const box = link.getBoundingClientRect();
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  link.appendChild(probe);
  const baseline = snap(probe.getBoundingClientRect().top, dpr);
  probe.remove();
  link.style.setProperty('--ul-left', onLayoutGrid(snap(box.left + ink.left, dpr) - box.left, dpr) + 'px');
  link.style.setProperty('--ul-right', onLayoutGrid(box.right - snap(box.left + ink.right, dpr), dpr) + 'px');
  link.style.setProperty('--ul-top', onLayoutGrid(baseline + 4 - box.top, dpr) + 'px');
}
