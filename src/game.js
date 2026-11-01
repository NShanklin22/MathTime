// The rules of play, with no DOM. The view asks it what happened and animates.
//
// `state` is one object, updated in place and never replaced: the view and the
// browser tests hold references to it. `level` is the level being played;
// start() switches it.
//
// phase: 'playing' – accepting input
//        'correct' – answer was right; input locked until next() or start()
//        'out'     – third miss; input locked until restart() or start()
export function createGame(level, rng = Math.random) {
  let current = level;
  const state = {
    phase: 'playing',
    question: 1,
    lives: current.livesPerProblem,
    typed: '',
    problem: current.makeProblem(rng),
  };

  function fresh() {
    state.problem = current.makeProblem(rng);
    state.lives = current.livesPerProblem;
    state.typed = '';
    state.phase = 'playing';
  }

  // One key from the keypad or keyboard: a digit, 'Backspace' or 'Enter'.
  // Returns 'typed' | 'ignored' | 'correct' | 'wrong' | 'out'.
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
      if (Number(state.typed) === state.problem.answer) {
        state.phase = 'correct';
        return 'correct';
      }
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

  // Begin `chosen` (the level being played, by default) at question 1, with
  // full lives and a new problem, whatever the phase.
  function start(chosen = current) {
    current = chosen;
    state.question = 1;
    fresh();
  }

  function restart() {
    start();
  }

  return { state, press, next, start, restart, get level() { return current; } };
}
