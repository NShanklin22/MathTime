// Scroll `list`, and only the list, as little as it takes to show `el` and
// its focus ring (2px, 4px out) whole, its top first if both can't fit.
// scrollIntoView() would scroll the page too, which never scrolls. Whole
// pixels, rounded outward, as the scroll position may be. Where `el` and
// its ring already show, nothing moves. The level selector's list and the
// finish screen's column both scroll on a short screen.
const RING = 6;

export function reveal(list, el) {
  const view = list.getBoundingClientRect();
  const top = view.top + list.clientTop, bottom = top + list.clientHeight;
  const r = el.getBoundingClientRect();
  let by = Math.max(0, Math.ceil(r.bottom + RING - bottom));
  by = Math.min(by, Math.floor(r.top - RING - top));
  if (by) list.scrollTop += by;
}
