// Draws game state into the page.
export function createView(dom, layout, level) {
  const { slot, shown, caret, qnum, hearts, livesBox, a, b, ans } = dom;

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

  return { render, renderAnswer };
}
