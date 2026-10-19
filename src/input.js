// The keypad and the physical keyboard feed keys into one path: onKey(key)
// returns the game's result, and 'ignored' keys don't flash.
export function bindInput({ ans, pad, slot }, onKey) {
  ans.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // leave browser shortcuts alone
    if (e.key === 'Tab') { e.preventDefault(); return; }   // focus stays on the answer (spec §3.3)
    if (e.key !== 'Enter' && e.key !== 'Backspace' && !/^\d$/.test(e.key)) return;
    e.preventDefault();
    if (onKey(e.key) === 'ignored') return;
    const btn = pad.querySelector(`button[data-k="${e.key}"]`);
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 110);
  });
  // All typing goes through keydown; block native edits (paste, IME, letters).
  ans.addEventListener('beforeinput', e => e.preventDefault());
  ans.addEventListener('focus', () => slot.classList.add('focused'));
  ans.addEventListener('blur', () => slot.classList.remove('focused'));

  pad.addEventListener('click', e => {
    const btn = e.target.closest('button[data-k]');
    if (btn) onKey(btn.dataset.k);
  });

  // Keep focus in the answer while playing, without letting taps steal it.
  document.addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('at-select') && e.target !== ans) {
      e.preventDefault();
      ans.focus({ preventScroll: true });
    }
  });
}
