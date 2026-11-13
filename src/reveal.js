// Scroll `list`, and only the list, as little as it takes to show `el` and
// its focus ring (2px, 4px out) whole, its top first if both can't fit.
// scrollIntoView() would scroll the page too, which never scrolls. Whole
// pixels, rounded outward, as the scroll position may be. Where `el` and
// its ring already show, nothing moves. The level selector's list and the
// finish screen's column both scroll on a short screen. `clear` is room
// to leave past the ring as well: the selector's tiles leave 6px, so a
// ring is never flush with the list's edge, where it read as cut off (the
// UI review), as far as the list can scroll.
const RING = 6;

export function reveal(list, el, clear = 0) {
  const view = list.getBoundingClientRect();
  const top = view.top + list.clientTop, bottom = top + list.clientHeight;
  const r = el.getBoundingClientRect();
  const room = RING + clear;
  let by = Math.max(0, Math.ceil(r.bottom + room - bottom));
  by = Math.min(by, Math.floor(r.top - room - top));
  if (by) list.scrollTop += by;
}
