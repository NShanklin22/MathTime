// Draws game state into the page and plays the feedback animations
// (timings from spec §2).
export function createView(dom, layout, level) {
  const { eq, slot, shown, caret, qnum, hearts, livesBox, a, b, op, ans, status, topic, here, run } = dom;
  const ANIMS = ['shake', 'in', 'out'];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Feedback in flight belongs to the run it started in. reset() ends that
  // run for the view, as leaving for the level selector and starting a run
  // do (Level 2 spec §4). A pending showCorrect, showOut or showFinished
  // then finds its token stale and stops, so nothing it had still to do
  // happens: no slide, no next problem, no announcement, no screen after.
  let runToken = 0;
  function reset() {
    runToken += 1;
    eq.classList.remove(...ANIMS, 'correct');
  }

  // Problem digits: one fixed cell each, nudged so the ink is centred. The
  // equation's first digit starts on a whole device pixel (layout.leadIndent).
  function renderDigits(el, str) {
    el.replaceChildren(...[...str].map((c, i) => {
      const cell = document.createElement('span');
      cell.className = 'cell';
      cell.textContent = c;
      cell.style.textIndent = el === a && i === 0
        ? layout.leadIndent(c)
        : layout.inkOf(c, layout.geo.wide).off.toFixed(4) + 'em';
      return cell;
    }));
  }

  // Answer: ink-centred in the fixed box, caret a fixed gap after the ink
  // (layout.answerAt). A wrong entry wider than the box is scaled down
  // around its centre.
  function renderAnswer(typed) {
    const { geo } = layout;
    const span = document.createElement('span');
    span.className = 'cell';
    span.style.width = 'calc(var(--box-w) * 1em)';
    span.textContent = typed;
    const g = typed ? layout.inkOf(typed, geo.boxW) : null;
    const at = layout.answerAt(typed);
    span.style.textIndent = at.indent;
    if (g && g.w > geo.boxW + 1e-3) {
      span.style.transform = `scale(${(geo.boxW / g.w).toFixed(4)})`;
      span.style.transformOrigin = `50% ${geo.mid.toFixed(4)}em`;
    }
    shown.replaceChildren(span);
    ans.value = typed;                   // so screen readers hear the answer
    caret.style.left = at.caret;
    slot.classList.toggle('empty', typed === '');
    slot.classList.toggle('full', typed.length >= level.maxAnswerLength);
  }

  // The run bar (runs spec §2): a segment filled for each correct answer.
  // (The Level 2 play mockup, a record of its design, has no bar.)
  function renderRun(state) {
    if (!run) return;
    [...run.children].forEach((seg, i) => seg.classList.toggle('done', i < state.solved));
  }

  function render(state) {
    renderDigits(a, String(state.problem.a));
    renderDigits(b, String(state.problem.b));
    renderAnswer(state.typed);
    qnum.textContent = `Question ${state.question} of ${level.problemsPerRun}`;
    hearts.forEach((h, i) => h.classList.toggle('lost', i >= state.lives));
    livesBox.setAttribute('aria-label', state.lives === 1 ? '1 life left' : `${state.lives} lives left`);
    renderRun(state);
  }

  // Show `next`'s operator, answer length and place in the breadcrumb. Lay
  // the screen out again after this: the operator and the box are the level's.
  function setLevel(next) {
    level = next;
    op.textContent = level.op;
    ans.maxLength = level.maxAnswerLength;
    topic.textContent = level.topic;
    here.textContent = `Level ${level.n}`;
    run?.replaceChildren(...Array.from({ length: level.problemsPerRun }, () => document.createElement('span')));
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
    status.textContent = `Question ${state.question} of ${level.problemsPerRun}: ${state.problem.a} ${level.word} ${state.problem.b}`;
  }

  // Green for 0.35s, slide out, swap in the next problem, slide in. The swap
  // waits for the slide-out animation itself: its first frame comes a little
  // after it is asked for, so a timer would cut it short. With animations
  // off there is none, so the swap is at once; the long timer is only a
  // last resort for one that never ends. The new problem is centred on its
  // own ink before it slides in.
  async function showCorrect(state, next) {
    const token = runToken;
    status.textContent = 'Correct';      // always differs from the problem before it, so it is announced
    eq.classList.add('correct');
    renderRun(state);                    // its segment fills with the green
    await wait(350);
    if (token !== runToken) return;      // its run is over
    play('out');
    const slide = eq.getAnimations().find(anim => anim.animationName === 'out');
    if (slide) await Promise.race([slide.finished.catch(() => {}), wait(1000)]);
    if (token !== runToken) return;
    next();
    eq.classList.remove('correct');
    render(state);
    try {
      layout.place();
    } catch (err) {
      console.error(err);                // still slide in, wherever it is
    }
    announceProblem(state);
    play('in');
  }

  function showWrong(state) {
    render(state);
    status.textContent = `Wrong, ${livesBox.getAttribute('aria-label')}`;
    play('shake');
  }

  // Third miss: shake, then resolve true 0.45s later, when the level selector
  // is due, unless the game was restarted or its run ended meanwhile.
  async function showOut(state) {
    const token = runToken;
    render(state);
    status.textContent = 'Out of lives';
    play('shake');
    await wait(450);
    if (token !== runToken || state.phase !== 'out') return false;
    eq.classList.remove(...ANIMS);
    return true;
  }

  // The run's last correct answer: green for 0.35s, its segment filled at
  // once, then resolve true when the finish screen is due (runs spec §3),
  // unless its run ended meanwhile (a new one started, or you left). No
  // slide: the screen gives way.
  async function showFinished(state) {
    const token = runToken;
    status.textContent = 'Correct';
    eq.classList.add('correct');
    renderRun(state);
    await wait(350);
    if (token !== runToken || state.phase !== 'finished') return false;
    eq.classList.remove('correct');
    return true;
  }

  return { render, renderAnswer, setLevel, announceProblem, showCorrect, showWrong, showOut, showFinished, reset };
}
