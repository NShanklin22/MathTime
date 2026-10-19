// Wait for IBM Plex Mono (linked in index.html) before the first layout, so
// nothing is ever measured in a fallback font. Gives up after `timeoutMs`.
export function fontsReady(timeoutMs = 3000) {
  const loads = [400, 500, 600].map(w => document.fonts.load(`${w} 64px "IBM Plex Mono"`, '0123456789+=Q'));
  const timeout = new Promise(resolve => setTimeout(resolve, timeoutMs));
  return Promise.race([Promise.all(loads), timeout]).catch(() => {});
}
