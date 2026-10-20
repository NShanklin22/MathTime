// Pure geometry for ink-based alignment (spec §6.1). No DOM, so it is
// unit-tested. Metrics are in em (fractions of the font size).

// Ink edges in RGBA pixel data (from getImageData), in canvas px. Each edge
// uses how much of its pixel is covered, for sub-pixel precision.
export function edgesFromAlpha(data, width, height, min = 4) {
  const rows = new Uint8Array(height);
  const cols = new Uint8Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > rows[y]) rows[y] = a;
      if (a > cols[x]) cols[x] = a;
    }
  }
  let t = 0, b = height - 1, l = 0, r = width - 1;
  while (t < height && rows[t] < min) t++;
  if (t === height) return null;
  while (rows[b] < min) b--;
  while (cols[l] < min) l++;
  while (cols[r] < min) r--;
  return {
    top: t + 1 - rows[t] / 255,
    bottom: b + rows[b] / 255,
    left: l + 1 - cols[l] / 255,
    right: r + cols[r] / 255,
  };
}

// Edges around a text origin (x0, y0) drawn at `size` px, as em metrics:
// ascent and descent from the baseline, ink left of / right of the origin
// (abl, abr), and the advance width.
export function toMetrics(edges, x0, y0, size, advance) {
  return {
    asc: (y0 - edges.top) / size,
    desc: (edges.bottom - y0) / size,
    abl: (x0 - edges.left) / size,
    abr: (edges.right - x0) / size,
    adv: advance / size,
  };
}

// Where text must start so its ink is centred across `width` em.
// off: the text indent (may be negative); right: where the ink ends; w: ink width.
export function centreInk(m, width) {
  const off = width / 2 - (m.abr - m.abl) / 2;
  return { off, right: off + m.abr, w: m.abl + m.abr };
}

// The ink's vertical span inside a 1em line box whose baseline is at `base` em.
export function band(m, base) {
  const top = base - m.asc;
  const bottom = base + m.desc;
  return { top, h: bottom - top, mid: (top + bottom) / 2 };
}

// Grow a span (CSS px) outward to whole device pixels, so it always covers the ink.
// The results land on whole device pixels only if the coordinate origin is itself
// on a device pixel (layout passes values relative to a pixel-aligned baseline).
// The 1e-3 is in device px: it absorbs float noise so an exact boundary is not
// pushed out a whole pixel, at the cost of falling short by up to 0.001 device px.
// "+ 0" turns a -0 result into 0.
export function snapOutward(top, bottom, dpr) {
  return {
    top: Math.floor(top * dpr + 1e-3) / dpr + 0,
    bottom: Math.ceil(bottom * dpr - 1e-3) / dpr + 0,
  };
}

// Nearest whole device pixel, in CSS px (ties round toward +Infinity; never -0).
export const snap = (v, dpr) => Math.round(v * dpr) / dpr + 0;

// Nearest point of the layout grid, in CSS px (never -0). Chrome keeps
// positions in 64ths of a device pixel and truncates anything finer, so a
// length written with rounding or float noise can land a whole step short.
// Grid points are exact binary fractions, so they survive being written out.
export const onLayoutGrid = (v, dpr) => Math.round(v * 64 * dpr) / (64 * dpr) + 0;
