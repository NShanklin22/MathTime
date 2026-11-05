// The rules of play, with no DOM. The view asks it what happened and animates.
//
// `state` is one object, updated in place and never replaced: the view and the
// browser tests hold references to it. `level` is the level being played;
// start() switches it.
//
// A run is the level's `problemsPerRun` problems, each a different one of its
// facts (runs spec §1). Its last correct answer finishes it, and `result`
// then says what it took. A third miss, leave() or start() before the end
// leaves it unfinished, with no result.
//
// phase: 'playing'  – accepting input
//        'correct'  – answer was right; input locked until next() or start()
//        'out'      – third miss; input locked until restart() or start()
//        'finished' – the run's last answer was right; locked until start()
//        'left'     – the player left for the level selector; locked until start()
//
// `solved` counts the run's correct answers, each from the moment it is right.
//
// `now` is the clock, in ms (runs spec §4); tests pass their own. Nothing
// shows it. A problem is drawn exactly when the view shows it, so each is
// timed from then to its correct answer, misses included, and the run from
// its first problem to its last answer, feedback and slides included.
//
// A column level (`kind: 'column'`, Levels 6–7 batch plan) is played by its
// method (columns.js): a column at a time, right to left. Its state also
// holds the problem's working:
//   x      – the working, solved (method.solve)
//   cells  – what is written in each of the method's cells: id → '' or a digit
//   step   – the column being worked, an index into method.steps; one past
//            the last once every column is right
//   focus  – the cell the cursor is on, or null: the column is written and
//            the cursor hides until Enter checks it
//   done   – one flag a column: right, and locked
//   bad    – the cells the last check found wrong, in working order; none
//            after a right one
// A wrong check costs a life, and the last column right is the problem
// right: lives, misses, timing, `solved` and the result are a fact level's.
// `typed` stays empty. What a wrong check says (the first bad cell's name,
// or method.afterWrong's `what`) is the board's to work out: afterWrong is
// pure, so it can ask again.
const COLUMN_STATE = ['x', 'cells', 'step', 'focus', 'done', 'bad'];   // what a column level's state adds
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createGame(level, rng = Math.random, now = () => performance.now()) {
  let current = level;
  let left = [];            // the level's facts not yet asked in this run, in order
  let asked = [];           // the run's answered problems: { a, b, ms, misses }
  let startedAt = 0;        // when the run's first problem was shown
  let shownAt = 0;          // when the problem on screen was
  let result = null;
  const state = { phase: 'playing', question: 1, solved: 0, lives: 0, typed: '', problem: null };

  // A new problem: one of the facts not yet asked, each equally likely, or
  // the one of them the level's pick() chooses. A column level's starts
  // with nothing written, the cursor on its first column's answer digit; a
  // fact level's state has none of that.
  function fresh() {
    const at = current.pick ? current.pick(left, rng) : Math.floor(rng() * left.length);
    const [fact] = left.splice(at, 1);
    state.problem = { ...fact };
    state.lives = current.livesPerProblem;
    state.typed = '';
    state.phase = 'playing';
    if (current.kind === 'column') {
      const { method } = current;
      state.x = method.solve(fact.a, fact.b);
      state.cells = Object.fromEntries(method.cells.map(c => [c.id, '']));
      state.step = 0;
      state.focus = method.steps[0].cells[0];
      state.done = method.steps.map(() => false);
      state.bad = [];
    } else {
      for (const key of COLUMN_STATE) delete state[key];
    }
    shownAt = now();
  }

  // The answer on screen is right: time it, and finish the run on its last.
  function answered() {
    const at = now();
    const { a, b } = state.problem;
    asked.push({ a, b, ms: at - shownAt, misses: current.livesPerProblem - state.lives });
    state.solved += 1;
    if (state.solved < current.problemsPerRun) {
      state.phase = 'correct';
      return 'correct';
    }
    state.phase = 'finished';
    result = {
      level: current.n,
      totalMs: at - startedAt,
      misses: asked.reduce((sum, p) => sum + p.misses, 0),
      problems: asked,
    };
    return 'finished';
  }

  // One key from the keypad or keyboard: a digit, 'Backspace' or 'Enter',
  // and on a column level the arrows too (pressColumn).
  // Returns 'typed' | 'ignored' | 'correct' | 'finished' | 'wrong' | 'out',
  // and on a column level 'moved' or 'step' too.
  // 'typed' means the answer changed: a digit was added or removed, or, on
  // Level 7, a borrow was taken back.
  function press(key) {
    if (state.phase !== 'playing') return 'ignored';
    if (current.kind === 'column') return pressColumn(key);
    if (/^\d$/.test(key)) {
      if (state.typed.length >= current.maxAnswerLength) return 'ignored';
      state.typed += key;
      return 'typed';
    }
    if (key === 'Backspace') {
      if (!state.typed) return 'ignored';
      state.typed = state.typed.slice(0, -1);
      return 'typed';
    }
    if (key === 'Enter') {
      if (!state.typed) return 'ignored';
      if (Number(state.typed) === state.problem.answer) return answered();
      state.typed = '';
      state.lives -= 1;
      if (state.lives === 0) {
        state.phase = 'out';
        return 'out';
      }
      return 'wrong';
    }
    return 'ignored';
  }

  /* ---------- Column levels ---------- */
  const order = () => current.method.order(state.step, state.cells, state.focus);

  // The next empty cell of the column after `from`, in working order, or
  // none (the column is written: the caret hides until Enter checks it).
  function nextEmpty(from) {
    const o = order(), i = o.indexOf(from);
    for (let j = 1; j <= o.length; j++) {
      const id = o[(i + j) % o.length];
      if (state.cells[id] === '') return id;
    }
    return null;
  }

  // A key on a column level. A digit is written in the cell under the
  // cursor, which moves on to the next empty one. Backspace clears that
  // cell, or, with it empty, the last written one before it in working
  // order, and goes there; with none, the method may take something back
  // (Level 7: the borrow). Enter checks the column. An arrow moves the
  // cursor inside the column, as its nav says ('moved'): Level 7's Up in the
  // ones borrows. With the cursor hidden, the arrows go from the column's
  // answer digit.
  function pressColumn(key) {
    const { method } = current, { cells } = state;
    if (/^\d$/.test(key)) {
      if (!state.focus) return 'ignored';
      cells[state.focus] = key;
      state.focus = nextEmpty(state.focus);
      return 'typed';
    }
    if (key === 'Backspace') {
      if (state.focus && cells[state.focus] !== '') {
        cells[state.focus] = '';
        return 'typed';
      }
      const o = order();
      for (let j = (state.focus ? o.indexOf(state.focus) : o.length) - 1; j >= 0; j--) {
        if (cells[o[j]] !== '') {
          cells[o[j]] = '';
          state.focus = o[j];
          return 'typed';
        }
      }
      const back = method.backFromEmpty?.(cells, state.focus);
      if (!back) return 'ignored';
      state.focus = back.focus;
      return 'typed';
    }
    if (key === 'Enter') return check();
    if (ARROWS.has(key)) {
      const step = method.steps[state.step];
      const to = step.nav[state.focus ?? step.cells[0]]?.[key];
      if (!to) return 'ignored';
      state.focus = to;
      return 'moved';
    }
    return 'ignored';
  }

  // Enter checks the column being worked; with its answer cell empty
  // nothing happens, unless the column takes an empty answer cell for 0
  // (step.blankIsZero: Level 7's tens). Right: it locks and the cursor
  // moves on to the next column ('step'); the last column right is the
  // problem right. Wrong: a life is lost and only the wrong cells clear;
  // what was right stays, and the cursor goes to the first wrong one. A
  // missing borrow starts the borrow; one not needed is taken back
  // (method.afterWrong).
  function check() {
    const { method } = current;
    const step = method.steps[state.step];
    if (state.cells[step.cells[0]] === '' && !step.blankIsZero) return 'ignored';
    const bad = method.wrong(state.step, state.cells, state.x);
    state.bad = bad;
    if (!bad.length) {
      state.done[state.step] = true;
      state.step += 1;
      if (state.step === method.steps.length) {
        state.focus = null;
        return answered();
      }
      state.focus = method.steps[state.step].cells[0];
      return 'step';
    }
    state.lives -= 1;
    for (const id of bad) state.cells[id] = '';
    const after = method.afterWrong?.(state.step, bad, state.x);
    state.focus = after ? after.focus : bad[0];
    if (state.lives === 0) {
      state.phase = 'out';
      return 'out';
    }
    return 'wrong';
  }

  // A tap on a cell of the column being worked moves the cursor there; a
  // tap on any other cell, or on a fact level, does nothing.
  // Returns 'moved' | 'ignored'.
  function tap(id) {
    if (state.phase !== 'playing' || current.kind !== 'column') return 'ignored';
    if (!current.method.steps[state.step].cells.includes(id)) return 'ignored';
    state.focus = id;
    return 'moved';
  }

  // Only a correct answer moves on; next() in any other phase does nothing.
  function next() {
    if (state.phase !== 'correct') return;
    state.question += 1;
    fresh();
  }

  // Begin a run of `chosen` (the level being played, by default) at question
  // 1, with full lives and a new problem, whatever the phase. A run in
  // progress is left unfinished. Feedback the view is still playing for it
  // is the view's to stop (view.reset()): a next() it still calls could move
  // the new run on.
  function start(chosen = current) {
    current = chosen;
    left = [...current.facts];
    asked = [];
    result = null;
    state.question = 1;
    state.solved = 0;
    fresh();
    startedAt = shownAt;
  }

  // The same level again. The game itself starts runs with start(); the
  // tests use this.
  function restart() {
    start();
  }

  // The player left for the level selector (Level 2 spec §4). Until
  // start(), the game takes no keys, and a next() still to come for a right
  // answer does nothing. A run in progress is left unfinished, with no
  // result; a finished one keeps its result.
  function leave() {
    state.phase = 'left';
  }

  start(level);
  return { state, press, tap, next, start, restart, leave, get level() { return current; }, get result() { return result; } };
}