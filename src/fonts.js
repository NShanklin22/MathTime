// Wait for IBM Plex Mono before the first layout, so nothing is ever measured
// in a fallback font. The Google Fonts stylesheet is injected here, not linked
// in index.html, so the stylesheet request and the face loads share ONE timeout
// (started before the link goes in): a slow or blocked font host can never
// hold the page. IBM Plex Sans is requested too; it supplies Greek (spec §5.2).
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=block';

export function fontsReady(timeoutMs = 3000) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); });

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_CSS;
  const sheet = new Promise((resolve, reject) => { link.onload = resolve; link.onerror = reject; });
  document.head.appendChild(link);

  const faces = sheet.then(() => Promise.all(
    [400, 500, 600].map(w => document.fonts.load(`${w} 64px "IBM Plex Mono"`, '0123456789+−=Q'))));
  return Promise.race([faces, timeout]).catch(() => {}).finally(() => clearTimeout(timer));
}
