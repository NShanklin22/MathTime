import { setPace, reducedMotion } from './fx.js';

// The run bar (runs spec §2), as the momentum spec has it
// (docs/superpowers/specs/2026-11-23-momentum-design.md): a segment per
// problem, filled for each right answer, in groups of five (styles.css).
// For the answer box (view.js) and the column board (board.js) alike.
//
//   Groups: the fifth right answer of a group, but the run's last, flashes
//     the whole group white, settling back over 420ms.
//   Streak: from 3 right in a row, the streak's own segments glow, more at
//     6 and at 10 (hot1-hot3). A miss cools them to plain green.
//   Pace: the streak sets the next swap's timings (fx.js setPace()).
//
// Only colour and glow change: nothing moves. Under reduced motion, no flash.

export const GROUP = 5;
export const FLASH_MS = 420;

// The glow for a streak: 0, none; 1-3, as it builds.
export const streakTier = streak => (streak >= 10 ? 3 : streak >= 6 ? 2 : streak >= 3 ? 1 : 0);

const shown = new WeakMap();      // the bar → the count filled when it was last drawn

// Draw `state` on the bar `run` (its segments, built by the view).
export function paintRun(run, state) {
  setPace(state.streak ?? 0);
  if (!run) return;
  const segs = [...run.children];
  const tier = streakTier(state.streak ?? 0);
  const was = shown.get(run);
  shown.set(run, state.solved);
  segs.forEach((seg, i) => {
    seg.classList.toggle('done', i < state.solved);
    const hot = tier > 0 && i >= state.streakFrom && i < state.solved;
    for (const t of [1, 2, 3]) seg.classList.toggle(`hot${t}`, hot && t === tier);
  });
  const n = state.solved;
  if (was === n - 1 && n % GROUP === 0 && n < segs.length && !reducedMotion()) {
    for (const seg of segs.slice(n - GROUP, n)) flash(seg);
  }
}

// White, held a quarter of the time, then back to the segment's own colour.
function flash(seg) {
  seg.getAnimations().forEach(a => { if (a.id === 'flash') a.cancel(); });
  const white = { backgroundColor: '#ffffff', boxShadow: '0 0 12px 3px rgba(255, 255, 255, 0.9)' };
  seg.animate([{ ...white, offset: 0 }, { ...white, offset: 0.25 }], { id: 'flash', duration: FLASH_MS, easing: 'ease-out' });
}
