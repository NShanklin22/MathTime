import { levelName } from './levels.js';
import { TIMING, RED_MS, reducedMotion, createEffects, inkOver, redLine, strikeGeometry, fadeOut, fadeIn, cancelOn } from './fx.js';

// Draws game state into the page and plays the feedback animations
// (fx.js: inked over, the in-place reprint, the red-line).
export function createView(dom, layout, level) {
  const { eq, slot, shown, caret, qnum, hearts, livesBox, a, b, op, ans, status, here, run } = dom;
  // While a right answer is locked in (correct), its frame inked (inked),
  // the problem fading out or in (out, in), or a wrong answer struck (struck).
  const FEEDBACK = ['correct', 'inked', 'out', 'in', 'struck'];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const effects = createEffects();

  // Feedback in flight belongs to the run it started in. reset() ends that
  // run for the view, as leaving for the level selector and starting a run
  // do (Level 2 spec §4). A pending showCorrect, showOut or showFinished
  // then finds its token stale and stops, so nothing it had still to do
  // happens: no reprint, no next problem, no announcement, no screen after.
  // Whatever is still drawn goes with it.
  let runToken = 0;
  function reset() {
    runToken += 1;
    stop();
  }
  function stop() {
    effects.clear();
    cancelOn(eq);
    eq.classList.remove(...FEEDBACK);
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
    here.textContent = levelName(level);
    run?.replaceChildren(...Array.from({ length: level.problemsPerRun }, () => document.createElement('span')));
  }

  // Tell screen readers which problem is now on screen.
  function announceProblem(state) {
    status.textContent = `Question ${state.question} of ${level.problemsPerRun}: ${state.problem.a} ${level.word} ${state.problem.b}`;
  }

  // Inked over (fx.js): the pen round the box's frame (slot::after, from
  // the slot's own box), the answer's digits going green; then the frame's
  // own border and the digits are green (.inked).
  function ink() {
    const s = slot.getBoundingClientRect(), after = getComputedStyle(slot, '::after');
    const top = s.top + parseFloat(after.top);
    inkOver(effects, {
      parent: slot,
      r: { left: s.left, right: s.right, top, bottom: top + parseFloat(after.height) },
      bw: parseFloat(after.borderTopWidth),
      digits: [shown],
      traced: () => eq.classList.add('inked'),
    });
  }

  // Red-line (fx.js): `cell`, the wrong answer `typed` as it was drawn,
  // laid over the cleared box and struck through on its ink's middle.
  // A wrong entry wider than the box was drawn scaled to fit it.
  function strike(cell, typed) {
    if (!cell || !typed) return;
    const { geo } = layout;
    const ghost = document.createElement('span');
    ghost.className = 'ghost';
    ghost.append(cell);
    shown.parentElement.append(ghost);
    const inner = shown.parentElement.getBoundingClientRect();
    const w = Math.min(layout.inkOf(typed, geo.boxW).w, geo.boxW);
    const s = strikeGeometry({
      left: inner.left + (geo.boxW - w) / 2 * geo.fs,
      right: inner.left + (geo.boxW + w) / 2 * geo.fs,
      mid: inner.top + geo.mid * geo.fs,
      size: geo.fs,
    }, devicePixelRatio);
    eq.classList.add('struck');
    redLine(effects, { parent: slot, s, ghost, ended: () => eq.classList.remove('struck') });
  }

  // Right: inked over (150ms), the closed green frame held 90ms, faded out
  // (80ms); the next problem drawn and placed while unseen, centred on its
  // own ink, then faded in (120ms) where it sits. Input is locked until
  // the swap, 320ms. The fade-out is timed from the frame now shown
  // (fx.js), and the swap waits for it to end, not for a timer, so it is
  // never cut short. The fade-in starts fresh, from its own first frame:
  // drawing and placing the next problem comes just before it. Under
  // reduced motion there is neither: the inked state shows at once and
  // the swap is at 320ms. The long timer is only a last resort for a
  // fade-out that never ends.
  async function showCorrect(state, next) {
    const token = runToken;
    stop();
    status.textContent = 'Correct';      // always differs from the problem before it, so it is announced
    eq.classList.add('correct');
    renderRun(state);                    // its segment fills with the ink
    ink();
    await wait(TIMING.hold);
    if (token !== runToken) return;      // its run is over
    eq.classList.add('out');
    const out = fadeOut(eq);
    await (out ? Promise.race([out.finished.catch(() => {}), wait(1000)]) : wait(TIMING.out));
    if (token !== runToken) return;
    next();
    effects.clear();
    eq.classList.remove(...FEEDBACK);
    render(state);
    try {
      layout.place();
    } catch (err) {
      console.error(err);                // still fade in, wherever it is
    }
    out?.cancel();
    announceProblem(state);
    fadeIn(effects, eq);
  }

  // Wrong: the box cleared, and what was in it struck through (red-line).
  function showWrong(state) {
    stop();
    const cell = shown.firstElementChild?.cloneNode(true), typed = cell?.textContent ?? '';
    render(state);
    status.textContent = `Wrong, ${livesBox.getAttribute('aria-label')}`;
    strike(cell, typed);
  }

  // Third miss: the red-line, then resolve true once it has cleared (0.5s;
  // 0.45s under reduced motion), when the level selector is due, unless the
  // game was restarted or its run ended meanwhile.
  async function showOut(state) {
    const token = runToken;
    showWrong(state);
    status.textContent = 'Out of lives';
    await wait(reducedMotion() ? 450 : RED_MS);
    if (token !== runToken || state.phase !== 'out') return false;
    stop();
    return true;
  }

  // The run's last correct answer: inked over, its segment filled at once,
  // then resolve true when the finish screen is due (0.24s, as the closed
  // frame's hold ends; runs spec §3), unless its run ended meanwhile (a new
  // one started, or you left). No fade: the screen gives way.
  async function showFinished(state) {
    const token = runToken;
    stop();
    status.textContent = 'Correct';
    eq.classList.add('correct');
    renderRun(state);
    ink();
    await wait(TIMING.hold);
    if (token !== runToken || state.phase !== 'finished') return false;
    stop();
    return true;
  }

  // A key (skip) jumps a red-line or a fade-in to its end at once; a new
  // layout (settle) jumps every effect to its end, so none is left where
  // the screen was.
  const skip = () => effects.skip();
  const settle = () => effects.settle();

  return { render, renderAnswer, setLevel, announceProblem, showCorrect, showWrong, showOut, showFinished, reset, skip, settle };
}
