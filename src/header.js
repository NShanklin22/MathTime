import { onLayoutGrid, snap } from './ink.js';

// The header (spec §3.1, Level 2 spec §4).

// Drop the topic crumb if the header doesn't fit on one line: "Levels" and
// the level always stay. Then line the first crumb's ink up with the
// header's edge, where the roadmap strip starts, as the hearts' ink ends at
// the other edge: its left side bearing would leave it inside. Its start
// goes on a whole device pixel, where it is drawn exactly as scanned (small
// text is drawn on whole pixels at 1x), so the ink is within half a device
// pixel of the edge; or, where the edge is a notch's safe-area inset, within
// one, never past it.
export function fitHeader(topBar, scan) {
  topBar.classList.remove('tight');
  const where = topBar.querySelector('.where');
  const crumbs = topBar.querySelector('.crumbs');
  crumbs.style.marginLeft = '';
  if (crumbs.scrollWidth > where.clientWidth) topBar.classList.add('tight');
  const first = [...crumbs.children].find(el => el.getClientRects().length);
  if (!first?.textContent) return;
  const dpr = devicePixelRatio;
  const cs = getComputedStyle(first);
  const fs = parseFloat(cs.fontSize);
  const style = { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: (parseFloat(cs.letterSpacing) || 0) / fs };
  const edge = where.getBoundingClientRect().left;
  const inset = edge > parseFloat(getComputedStyle(topBar).getPropertyValue('--gutter')) + 0.01;
  const start = edge + scan(first.textContent, style, fs * dpr).abl * fs;   // the start that puts the ink on the edge
  const at = inset ? Math.ceil(start * dpr - 1e-6) / dpr : snap(start, dpr);
  crumbs.style.marginLeft = onLayoutGrid(at - edge, dpr) + 'px';
}
