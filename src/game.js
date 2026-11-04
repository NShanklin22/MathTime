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
export function createGame(level, rng = Math.random, now = () => performance.now()) {
  let current = level;
  let left = [];            // the level's facts not yet asked in this run, in order
  let asked = [];           // the run's answered problems: { a, b, ms, misses }
  let startedAt = 0;        // when the run's first problem was shown
  let shownAt = 0;          // when the problem on screen was
  let result = null;
  const state = { phase: 'playing', question: 1, solved: 0, lives: 0, typed: '', problem: null };

  // A new problem: one of the facts not yet asked, each equally likely.
  function fresh() {
    const [fact] = left.splice(Math.floor(rng() * left.length), 1);
    state.problem = { ...fact };
    state.lives = current.livesPerProblem;
    state.typed = '';
    state.phase = 'playing';
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

  // One key from the keypad or keyboard: a digit, 'Backspace' or 'Enter'.
  // Returns 'typed' | 'ignored' | 'correct' | 'finished' | 'wrong' | 'out'.
  // 'typed' means the answer changed: a digit was added or removed.
  function press(key) {
    if (state.phase !== 'playing') return 'ignored';
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
  return { state, press, next, start, restart, leave, get level() { return current; }, get result() { return result; } };
}
