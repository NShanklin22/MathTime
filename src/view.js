// Draws game state into the page and plays the feedback animations
// (timings from spec §2).
export function createView(dom, layout, level) {
  const { eq, slot, shown, caret, qnum, hearts, livesBox, a, b, ans, status } = dom;
  const ANIMS = ['shake', 'in', 'out'];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Problem digits: one fixed cell each, nudged so the ink is centred. The
  // equation's first digit starts on a whole device pixel (layout.leadIndent).
  function renderDigits(el, str) {
    el.replaceChildren(...[...str].map((c, i) => {
      const cell = document.createElement('span');
      cell.className = 'cell';
      cell.textContent = c;
      cell.style.textIndent = el === a && i === 0
        ? layout.leadIndent(c) + 'px'
        : layout.inkOf(c, layout.geo.wide).off.toFixed(4) + 'em';
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

  // Tell screen readers which problem is now on screen.
  function announceProblem(state) {
    status.textContent = `Question ${state.question}: ${state.problem.a} plus ${state.problem.b}`;
  }

  // Green for 0.35s, slide out, swap in the next problem, slide in. The swap
  // waits for the slide-out animation itself: its first frame comes a little
  // after it is asked for, so a timer would cut it short. With animations
  // off there is none, so the swap is at once; the long timer is only a
  // last resort for one that never ends. The new problem is centred on its
  // own ink before it slides in.
  async function showCorrect(state, next) {
    status.textContent = 'Correct';      // always differs from the problem before it, so it is announced
    eq.classList.add('correct');
    await wait(350);
    play('out');
    const slide = eq.getAnimations().find(anim => anim.animationName === 'out');
    if (slide) await Promise.race([slide.finished.catch(() => {}), wait(1000)]);
    next();
    eq.classList.remove('correct');
    render(state);
    layout.place();
    announceProblem(state);
    play('in');
  }

  function showWrong(state) {
    render(state);
    status.textContent = `Wrong, ${livesBox.getAttribute('aria-label')}`;
    play('shake');
  }

  // Third miss: shake, then the level selector 0.45s later, unless the game
  // was restarted meanwhile. Resolves true if the selector is showing.
  async function showOut(state) {
    render(state);
    status.textContent = 'Out of lives';
    play('shake');
    await wait(450);
    if (state.phase !== 'out') return false;
    eq.classList.remove(...ANIMS);
    document.body.classList.add('at-select');
    return true;
  }

  return { render, renderAnswer, announceProblem, showCorrect, showWrong, showOut };
}
