import { edgesFromAlpha, toMetrics } from './ink.js';

// How many font/size groups to keep. A layout uses two or three (the
// equation, maybe a fitted size, the keypad); older ones are stale.
const MAX_GROUPS = 4;

// Measures a string's ink by drawing it offscreen at its real on-screen size
// in device pixels, so font hinting matches what is drawn (spec §6.1).
// style: { weight, family } as in computed CSS. Returns em metrics (ink.js).
export function createScanner() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const groups = new Map();          // "weight|family|size" → Map(text → metrics), oldest first

  // The cache for one font and size, marked as the most recently used.
  function group(style, size) {
    const key = `${style.weight}|${style.family}|${size}`;
    const cache = groups.get(key) ?? new Map();
    groups.delete(key);
    groups.set(key, cache);
    if (groups.size > MAX_GROUPS) groups.delete(groups.keys().next().value);
    return cache;
  }

  function scan(text, style, size) {
    const cache = group(style, size);
    if (cache.has(text)) return cache.get(text);
    const font = `${style.weight} ${size}px ${style.family}`;
    ctx.font = font;
    // Size the scan area from the browser's rough (rounded) ink bounds, with
    // about 0.25em to spare on every side. The clip check below throws if
    // that is ever not enough.
    const t = ctx.measureText(text);
    const margin = Math.ceil(size / 4);
    const x0 = margin + Math.ceil(Math.max(0, t.actualBoundingBoxLeft));
    const y0 = margin + Math.ceil(Math.max(0, t.actualBoundingBoxAscent));
    const width = x0 + Math.ceil(Math.max(0, t.width, t.actualBoundingBoxRight)) + margin;
    const height = y0 + Math.ceil(Math.max(0, t.actualBoundingBoxDescent)) + margin;
    if (canvas.width < width || canvas.height < height) {
      canvas.width = Math.max(canvas.width, width);     // resizing resets the context
      canvas.height = Math.max(canvas.height, height);
      ctx.font = font;
    }
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x0, y0);
    const edges = edgesFromAlpha(ctx.getImageData(0, 0, width, height).data, width, height);
    if (!edges) throw new Error(`No ink for "${text}"`);
    if (edges.top < 1 || edges.left < 1 || edges.bottom > height - 1 || edges.right > width - 1) {
      throw new Error(`Ink for "${text}" is clipped by the scan canvas`);
    }
    const m = toMetrics(edges, x0, y0, size, t.width);
    cache.set(text, m);
    return m;
  }

  // Forget every measurement. The cache key can't tell a fallback font from
  // the real one, so this must run when a font finishes loading late.
  scan.reset = () => groups.clear();
  return scan;
}
