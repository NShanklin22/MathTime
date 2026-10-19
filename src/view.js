// Draws game state into the page and plays the feedback animations
// (timings from spec §2).
export function createView(dom, layout, level) {
  const { eq, slot, shown, caret, qnum, hearts, livesBox, a, b, ans, status } = dom;
  const ANIMS = ['shake', 'in', 'out'];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Problem digits: one fixed cell each, nudged so the ink is centred.
  function renderDigits(el, str) {
    el.replaceChildren(...[...str].map(c => {
      const cell = document.createElement('span');
      cell.className = 'cell';
      cell.textContent = c;
      cell.style.textIndent = layout.inkOf(c, layout.geo.wide).off.toFixed(4) + 'em';
      return cell;
    }));
  }

  // Answer: ink-centred in the fixed box, caret a fixed gap after the ink.
  // A wrong entry wider than the box is scaled down around its centre.
  function renderAnswer(typed) {
    const { geo } = layout;
    const span = document.createElement('span');
    span.className = 'cell';
    span.style.width = 'calc(var(--box-w) * 1em)';
    span.textContent = typed;
    const g = typed ? layout.inkOf(typed, geo.boxW) : { off: 0, right: 0, w: 0 };
    span.style.textIndent = g.off.toFixed(4) + 'em';
    if (g.w > geo.boxW + 1e-3) {
      span.style.transform = `scale(${(geo.boxW / g.w).toFixed(4)})`;
      span.style.transformOrigin = `50% ${geo.mid.toFixed(4)}em`;
    }
    shown.replaceChildren(span);
    ans.value = typed;                   // so screen readers hear the answer
    caret.style.left = typed ? `calc(${g.right.toFixed(4)}em + max(0.08em, 4px))` : '';
    slot.classList.toggle('empty', typed === '');
    slot.classList.toggle('full', typed.length >= level.maxAnswerLength);
  }

  function render(state) {
    renderDigits(a, String(state.problem.a));
    renderDigits(b, String(state.problem.b));
    renderAnswer(state.typed);
    qnum.textContent = 'Question ' + state.question;
    hearts.forEach((h, i) => h.classList.toggle('lost', i >= state.lives));
    livesBox.setAttribute('aria-label', state.lives === 1 ? '1 life left' : `${state.lives} lives left`);
  }

  function play(cls) {
    eq.classList.remove(...ANIMS);
    void eq.offsetWidth;                 // restart the animation
    eq.classList.add(cls);
  }
  eq.addEventListener('animationend', e => {
    // 'out' holds its end state until 'in' replaces it.
    if (e.target === eq && e.animationName !== 'out') eq.classList.remove(...ANIMS);
  });

  // Green for 0.35s, slide out, swap in the next problem, slide in.
  async function showCorrect(state, next) {
    status.textContent = `Question ${state.question} correct`;   // differs each time, so it is re-announced
    eq.classList.add('correct');
    await wait(350);
    play('out');
    await wait(220);
    next();
    eq.classList.remove('correct');
    render(state);
    play('in');
  }

  function showWrong(state) {
    render(state);
    status.textContent = `Wrong, ${livesBox.getAttribute('aria-label')}`;
    play('shake');
  }

  // Third miss: shake, then the level selector 0.45s later.
  async function showOut(state) {
    render(state);
    status.textContent = 'Out of lives';
    play('shake');
    await wait(450);
    eq.classList.remove(...ANIMS);
    document.body.classList.add('at-select');
  }

  return { render, renderAnswer, showCorrect, showWrong, showOut };
}
