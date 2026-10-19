import { PNG } from 'pngjs';

// Load the game and wait until fonts are in and the first layout is done.
export async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('loading'));
}

// For pixel measurement: plain background (no grid), no blinking caret and no
// dashed outline. None of these change layout.
export async function freeze(page) {
  await page.addStyleTag({
    content: 'body{background:#12407e!important}.caret{animation:none!important}.slot::after{outline:none!important}',
  });
}

// Put a known problem on screen (uses the handle main.js exposes for tests).
export async function setProblem(page, a, b) {
  await page.evaluate(([a, b]) => {
    const { game, view } = window.mathtime;
    game.state.problem = { a, b, answer: a + b };
    view.render(game.state);
  }, [a, b]);
}

export async function rect(page, selector, index = 0) {
  return page.evaluate(([sel, i]) => {
    const r = document.querySelectorAll(sel)[i].getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }, [selector, index]);
}

export async function capture(page) {
  const dpr = await page.evaluate(() => devicePixelRatio);
  return { png: PNG.sync.read(await page.screenshot()), dpr };
}

// Sub-pixel bounds (CSS px) of light ink inside `area` (CSS px), from real
// screenshot pixels. Coverage comes from the blue channel: background #12407e
// is blue 126 and ink #eef5ff is blue 255, so the amber caret (blue 107)
// counts as nothing.
export function ink({ png, dpr }, area) {
  const x0 = Math.max(0, Math.floor(area.left * dpr));
  const x1 = Math.min(png.width, Math.ceil(area.right * dpr));
  const y0 = Math.max(0, Math.floor(area.top * dpr));
  const y1 = Math.min(png.height, Math.ceil(area.bottom * dpr));
  const rows = new Float64Array(y1 - y0);
  const cols = new Float64Array(x1 - x0);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const blue = png.data[(y * png.width + x) * 4 + 2];
      const f = Math.min(1, Math.max(0, (blue - 126) / (255 - 126)));
      if (f > rows[y - y0]) rows[y - y0] = f;
      if (f > cols[x - x0]) cols[x - x0] = f;
    }
  }
  const MIN = 0.05;
  let t = 0, b = rows.length - 1, l = 0, r = cols.length - 1;
  while (t < rows.length && rows[t] < MIN) t++;
  if (t === rows.length) return null;
  while (rows[b] < MIN) b--;
  while (cols[l] < MIN) l++;
  while (cols[r] < MIN) r--;
  const top = (y0 + t + 1 - rows[t]) / dpr;
  const bottom = (y0 + b + rows[b]) / dpr;
  const left = (x0 + l + 1 - cols[l]) / dpr;
  const right = (x0 + r + cols[r]) / dpr;
  return { top, bottom, left, right, midY: (top + bottom) / 2, midX: (left + right) / 2 };
}

// Type a string on the physical keyboard (digits, then optional Enter).
export async function typeKeys(page, keys) {
  for (const k of keys) await page.keyboard.press(k);
}

// Spec target is 0.5px; 0.05px allows for this measurement's own rounding.
export const TOL = 0.55;
