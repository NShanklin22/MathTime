// The level selector (Level 2 spec §3): a row per built level, grouped by
// topic in route order, each a button that calls choose(level). The level
// you came from is marked with an amber bar and gets the focus.
export function createSelector(root, levels, choose) {
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const rows = new Map();                    // level → its row
  let group = null;
  for (const level of levels) {
    if (group?.dataset.topic !== level.topic) {
      group = el('section', 'group');
      group.dataset.topic = level.topic;
      group.append(el('h2', 'group-name', level.topic));
      root.append(group);
    }
    const row = el('button', 'row');
    row.dataset.level = level.n;
    row.setAttribute('aria-label', `Level ${level.n}: ${level.name}`);
    const txt = el('span', 'txt');
    txt.append(el('span', 'title', `Level ${level.n}`), el('span', 'name', level.name));
    // A sample problem, set like the equation: digits, then the operator.
    const sample = el('span', 'sample');
    sample.setAttribute('aria-hidden', 'true');
    const [a, b] = level.sample;
    sample.append(el('span', null, String(a)), el('span', 'op', level.op), el('span', null, String(b)));
    row.append(txt, sample);
    row.addEventListener('click', () => choose(level));
    rows.set(level, row);
    group.append(row);
  }

  // The Enter that made a third miss may still be held: its key repeat
  // (about 0.5s) would otherwise press a row as soon as it has focus.
  root.addEventListener('keydown', e => {
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
  });

  // Mark the level you came from, or none.
  function mark(level) {
    for (const [l, row] of rows) row.classList.toggle('current', l === level);
  }

  // Focus the marked row, so the keyboard carries on from there.
  function focus() {
    root.querySelector('.row.current')?.focus({ preventScroll: true });
  }

  return { mark, focus };
}
