import { edgesFromAlpha, toMetrics } from './ink.js';

// Measures a string's ink by drawing it offscreen at its real on-screen size
// in device pixels, so font hinting matches what is drawn (spec §6.1).
// style: { weight, family } as in computed CSS. Returns em metrics (ink.js).
export function createScanner() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  function scan(text, style, size) {
    const key = `${style.weight}|${style.family}|${size}|${text}`;
    if (cache.has(key)) return cache.get(key);
    const width = Math.ceil(size * (text.length * 1.3 + 1));
    const height = Math.ceil(2 * size);
    const x0 = Math.round(size / 2);
    const y0 = Math.round(size * 1.3);
    canvas.width = width;              // also clears the canvas
    canvas.height = height;
    ctx.font = `${style.weight} ${size}px ${style.family}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x0, y0);
    const edges = edgesFromAlpha(ctx.getImageData(0, 0, width, height).data, width, height);
    if (!edges) throw new Error(`No ink for "${text}"`);
    if (edges.top <= 0 || edges.left <= 0 || edges.bottom >= height || edges.right >= width) {
      throw new Error(`Ink for "${text}" is clipped by the scan canvas`);
    }
    const m = toMetrics(edges, x0, y0, size, ctx.measureText(text).width);
    cache.set(key, m);
    return m;
  }
  // Forget every measurement. The cache key can't tell a fallback font from
  // the real one, so this must run when a font finishes loading late.
  scan.reset = () => cache.clear();
  return scan;
}
