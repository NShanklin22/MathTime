import { onLayoutGrid, snap } from './ink.js';

// The header (spec §3.1, Level 2 spec §4).

// A text element's font as the scanner wants it.
function fontOf(el) {
  const cs = getComputedStyle(el);
  const fs = parseFloat(cs.fontSize);
  return { fs, style: { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: (parseFloat(cs.letterSpacing) || 0) / fs } };
}

// Drop the topic crumb if the header doesn't fit on one line: "Levels" and
// the level always stay. Then line the first crumb's ink up with the
// header's edge, as the hearts' ink ends at the other edge: its left side
// bearing would leave it inside. Its start
// goes on a whole device pixel, where it is drawn exactly as scanned (small
// text is drawn on whole pixels at 1x), so the ink is within half a device
// pixel of the edge; or, where the edge is a notch's safe-area inset, within
// one, never past it. Last, the underline under "Levels", now that it is
// in place.
export function fitHeader(topBar, scan) {
  topBar.classList.remove('tight');
  const where = topBar.querySelector('.where');
  const crumbs = topBar.querySelector('.crumbs');
  crumbs.style.marginLeft = '';
  if (crumbs.scrollWidth > where.clientWidth) topBar.classList.add('tight');
  const first = [...crumbs.children].find(el => el.getClientRects().length);
  if (!first?.textContent) return;
  const dpr = devicePixelRatio;
  const { fs, style } = fontOf(first);
  const edge = where.getBoundingClientRect().left;
  const inset = edge > parseFloat(getComputedStyle(topBar).getPropertyValue('--gutter')) + 0.01;
  const start = edge + scan(first.textContent, style, fs * dpr).abl * fs;   // the start that puts the ink on the edge
  const at = inset ? Math.ceil(start * dpr - 1e-6) / dpr : snap(start, dpr);
  crumbs.style.marginLeft = onLayoutGrid(at - edge, dpr) + 'px';
  if (first.classList.contains('back')) underline(first, scan);
}

// The way back's underline (Level 2 spec §4), from the first ink of
// "Levels" to its last and 4px below its baseline, all on whole device
// pixels. The ends come from its scanned ink. The baseline comes from a
// probe, put on a whole device pixel as the page draws it (keypad.js).
function underline(link, scan) {
  const dpr = devicePixelRatio;
  const { fs, style } = fontOf(link);
  const m = scan(link.textContent, style, fs * dpr);
  const box = link.getBoundingClientRect();
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  link.appendChild(probe);
  const baseline = snap(probe.getBoundingClientRect().top, dpr);
  probe.remove();
  link.style.setProperty('--ul-left', onLayoutGrid(snap(box.left - m.abl * fs, dpr) - box.left, dpr) + 'px');
  link.style.setProperty('--ul-right', onLayoutGrid(box.right - snap(box.left + m.abr * fs, dpr), dpr) + 'px');
  link.style.setProperty('--ul-top', onLayoutGrid(baseline + 4 - box.top, dpr) + 'px');
}
