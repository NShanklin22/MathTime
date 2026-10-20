import { snap } from './ink.js';

// The keypad (spec §3.3).

// Centre each digit key's label on its real ink. Labels are much smaller
// than the equation and snap to pixels differently, so each is scanned at
// its own device size. Text baselines snap to whole device pixels, so the
// vertical shift is a whole number of device pixels too. A pressed key is
// scaled down, so its label keeps its last position. All the reads happen
// in one pass, between the writes.
export function centreKeys(pad, scan) {
  const dpr = devicePixelRatio;
  const labels = [...pad.querySelectorAll('.kl')].filter(kl => {
    const key = kl.parentElement;
    return key.getBoundingClientRect().width && !key.classList.contains('pressed') && !key.matches(':active');
  });
  const probes = labels.map(kl => {
    kl.style.transform = 'none';
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    kl.appendChild(probe);
    return probe;
  });
  const found = labels.map((kl, i) => {
    const cs = getComputedStyle(kl);
    return {
      key: kl.parentElement.getBoundingClientRect(),
      label: kl.getBoundingClientRect(),
      baseY: snap(probes[i].getBoundingClientRect().top, dpr),
      kfs: parseFloat(cs.fontSize),
      style: { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color },
    };
  });
  probes.forEach(probe => probe.remove());
  labels.forEach((kl, i) => {
    const { key, label, baseY, kfs, style } = found[i];
    const m = scan(kl.textContent, style, kfs * dpr);
    const dy = snap(key.top + key.height / 2 - (baseY - (m.asc - m.desc) / 2 * kfs), dpr);
    const dx = key.left + key.width / 2 - (m.abr - m.abl) / 2 * kfs - label.left;
    kl.style.transform = `translate(${dx.toFixed(3)}px, ${dy.toFixed(3)}px)`;
  });
}
