import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL1 } from '../../src/level1.js';
import { LEVEL2 } from '../../src/level2.js';
import { createGame } from '../../src/game.js';

// An rng that returns the given values in order, then repeats them.
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};
// The rng value that draws the `i`th (from 0) of `n` facts left. Each draw
// takes the fact at Math.floor(rng() × n) among those not yet asked, in the
// level's order: Level 1's fact a + b is number a × 10 + b.
const nth = (i, n) => (i + 0.5) / n;
// The first problem is 7 + 5. Use it when the test stays on the first problem.
const sevenPlusFive = () => createGame(LEVEL1, () => nth(75, 100));
// Problems come out as 7 + 5, then 2 + 3, then 1 + 9. They are all different,
// so a test can tell "a new problem was drawn" from "the same problem stayed".
// Drawn from all 100 facts, as after a restart, the second value is 2 + 3
// too, and the third 1 + 9.
const threeProblems = () => createGame(LEVEL1, seq(nth(75, 100), nth(23, 99), nth(19, 98)));
// The first problem is 2 + 3 = 5, a single-digit answer.
const twoPlusThree = () => createGame(LEVEL1, () => nth(23, 100));
// Every rng value is 0.25, so Level 1 starts on 2 + 5 and Level 2 on 4 − 3.
const quarters = () => createGame(LEVEL1, () => 0.25);

// Miss the current problem (answer 9 is wrong for every problem used here).
const miss = (game) => {
  game.press('9');
  return game.press('Enter');
};

// Run out of lives on the current problem, leaving the game in phase 'out'.
const runOut = (game) => {
  miss(game);
  miss(game);
  miss(game);
};

// Whatever the player presses, a locked game ignores it and changes nothing.
const assertLocked = (game) => {
  const before = structuredClone(game.state);
  for (const key of ['0', '1', '5', '9', 'Enter', 'Backspace']) {
    assert.equal(game.press(key), 'ignored', `'${key}' should be ignored`);
  }
  assert.deepEqual(game.state, before);
};

test('Level 1 lists every possible answer, 0 to 18, as strings', () => {
  assert.deepEqual(LEVEL1.possibleAnswers, [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    '10', '11', '12', '13', '14', '15', '16', '17', '18',
  ]);
});

test('starts on question 1 with 3 lives and an empty answer', () => {
  const { state } = sevenPlusFive();
  assert.equal(state.phase, 'playing');
  assert.equal(state.question, 1);
  assert.equal(state.lives, 3);
  assert.equal(state.typed, '');
  assert.deepEqual(state.problem, { a: 7, b: 5, answer: 12 });
});

test('digits fill the answer, up to 2 characters', () => {
  const game = sevenPlusFive();
  assert.equal(game.press('1'), 'typed');
  assert.equal(game.press('2'), 'typed');
  assert.equal(game.press('3'), 'ignored');
  assert.equal(game.state.typed, '12');
});

test('backspace removes the last digit, and is ignored on an empty answer', () => {
  const game = sevenPlusFive();
  game.press('1');
  game.press('8');
  assert.equal(game.press('Backspace'), 'typed');
  assert.equal(game.state.typed, '1');
  game.press('Backspace');
  assert.equal(game.press('Backspace'), 'ignored');
});

test('checking an empty answer is ignored and costs no life', () => {
  const game = sevenPlusFive();
  assert.equal(game.press('Enter'), 'ignored');
  assert.equal(game.state.lives, 3);
});

test('a correct answer locks input until next()', () => {
  const game = sevenPlusFive();
  game.press('1');
  game.press('2');
  assert.equal(game.press('Enter'), 'correct');
  assert.equal(game.state.phase, 'correct');
  assert.equal(game.press('3'), 'ignored');
});

test('a correct answer leaves the typed answer and the lives as they were', () => {
  const game = sevenPlusFive();
  game.press('1');
  game.press('2');
  game.press('Enter');
  assert.equal(game.state.typed, '12');
  assert.equal(game.state.lives, 3);

  // Lives are not refilled or spent by the correct answer, only by next().
  const afterMiss = sevenPlusFive();
  miss(afterMiss);
  afterMiss.press('1');
  afterMiss.press('2');
  afterMiss.press('Enter');
  assert.equal(afterMiss.state.typed, '12');
  assert.equal(afterMiss.state.lives, 2);
});

test('while the answer is correct, Enter and Backspace do nothing either', () => {
  const game = sevenPlusFive();
  game.press('1');
  game.press('2');
  game.press('Enter');
  assert.equal(game.state.phase, 'correct');
  assertLocked(game);
  assert.equal(game.state.phase, 'correct');
});

test('a correct short answer locks digits too, not just a full-length one', () => {
  // '12' is at the length cap anyway; '5' has room for another digit, so only
  // the phase lock keeps '3' out.
  const game = twoPlusThree();
  game.press('5');
  assert.equal(game.press('Enter'), 'correct');
  assert.equal(game.press('3'), 'ignored');
  assert.equal(game.state.typed, '5');
  assertLocked(game);
  assert.equal(game.state.typed, '5');
  assert.equal(game.state.phase, 'correct');
});

test('next() does nothing unless the answer was correct', () => {
  // While playing, even mid-answer after a miss.
  const playing = threeProblems();
  miss(playing);
  playing.press('1');
  const duringPlay = structuredClone(playing.state);
  playing.next();
  assert.deepEqual(playing.state, duringPlay);

  // After running out of lives.
  const out = threeProblems();
  runOut(out);
  const afterOut = structuredClone(out.state);
  out.next();
  assert.deepEqual(out.state, afterOut);
  assert.equal(out.state.phase, 'out');
});

test('state stays the same object across next() and restart()', () => {
  // The view and the browser tests hold on to game.state.
  const game = threeProblems();
  const state = game.state;
  game.press('1');
  game.press('2');
  game.press('Enter');
  game.next();
  assert.equal(game.state, state);
  assert.equal(state.question, 2);
  runOut(game);
  game.restart();
  assert.equal(game.state, state);
  assert.equal(state.question, 1);
  assert.equal(state.phase, 'playing');
});

test('next() moves to the next question with full lives, an empty answer and a new problem', () => {
  const game = threeProblems();
  assert.deepEqual(game.state.problem, { a: 7, b: 5, answer: 12 });
  miss(game);                     // wrong: 2 lives left
  game.press('1');
  game.press('2');
  game.press('Enter');            // correct
  game.next();
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.question, 2);
  assert.equal(game.state.lives, 3);
  assert.equal(game.state.typed, '');
  assert.deepEqual(game.state.problem, { a: 2, b: 3, answer: 5 });
});

test('a wrong answer clears the answer and costs a life, same problem', () => {
  const game = threeProblems();
  game.press('9');
  assert.equal(game.press('Enter'), 'wrong');
  assert.equal(game.state.typed, '');
  assert.equal(game.state.lives, 2);
  assert.equal(game.state.phase, 'playing');
  assert.deepEqual(game.state.problem, { a: 7, b: 5, answer: 12 });

  // Still the same problem after a second miss.
  assert.equal(miss(game), 'wrong');
  assert.equal(game.state.lives, 1);
  assert.deepEqual(game.state.problem, { a: 7, b: 5, answer: 12 });
});

test('after a wrong answer the player can start typing again straight away', () => {
  const game = sevenPlusFive();
  assert.equal(miss(game), 'wrong');
  assert.equal(game.press('1'), 'typed');
  assert.equal(game.state.typed, '1');
  game.press('2');
  assert.equal(game.press('Enter'), 'correct');
});

test('the third miss ends the problem; restart() goes back to question 1', () => {
  const game = threeProblems();
  game.press('1'); game.press('2'); game.press('Enter');
  game.next();                    // question 2, problem 2 + 3
  assert.deepEqual(game.state.problem, { a: 2, b: 3, answer: 5 });
  assert.equal(miss(game), 'wrong');   // 1st miss
  assert.equal(miss(game), 'wrong');   // 2nd miss
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.lives, 1);
  game.press('9');
  assert.equal(game.press('Enter'), 'out');   // 3rd miss
  assert.equal(game.state.phase, 'out');
  assert.equal(game.state.typed, '');
  assert.equal(game.state.lives, 0);
  assert.equal(game.press('1'), 'ignored');
  game.restart();
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.question, 1);
  assert.equal(game.state.lives, 3);
  assert.equal(game.state.typed, '');
  assert.deepEqual(game.state.problem, { a: 1, b: 9, answer: 10 });
});

test('when out of lives, every key is ignored and nothing changes', () => {
  const game = sevenPlusFive();
  runOut(game);
  assert.equal(game.state.phase, 'out');
  assertLocked(game);
  assert.equal(game.state.phase, 'out');
});

test('restart() draws a new problem instead of keeping the lost one', () => {
  const game = threeProblems();
  runOut(game);                   // lost on 7 + 5
  game.restart();
  assert.deepEqual(game.state.problem, { a: 2, b: 3, answer: 5 });
});

test('unknown keys are ignored', () => {
  const game = sevenPlusFive();
  assert.equal(game.press('a'), 'ignored');
  assert.equal(game.press('Tab'), 'ignored');
});

test('keys that merely contain digits, or only look like them, are ignored', () => {
  const game = sevenPlusFive();
  const before = structuredClone(game.state);
  const keys = [
    'F1', 'F12', 'Numpad1', 'Digit1',   // names of function and numpad keys
    '12', '1a', 'a1', ' 1', '1 ', '1\n', // more than one character
    '٣',                            // an Arabic-Indic digit, not 0 to 9
    '', ' ', '-', '.', '+',
    'enter', 'backspace', 'Delete',      // wrong spelling or case
  ];
  for (const key of keys) {
    assert.equal(game.press(key), 'ignored', `${JSON.stringify(key)} should be ignored`);
  }
  assert.deepEqual(game.state, before);
});

test('a leading zero is part of the answer, and still counts as correct', () => {
  // Intended behaviour: the answer is compared as a number, so for 2 + 3 the
  // typed '05' is accepted. Level 1 does not reject a leading zero.
  const game = twoPlusThree();
  assert.deepEqual(game.state.problem, { a: 2, b: 3, answer: 5 });
  assert.equal(game.press('0'), 'typed');
  assert.equal(game.press('5'), 'typed');
  assert.equal(game.state.typed, '05');
  assert.equal(game.press('Enter'), 'correct');
  assert.equal(game.state.phase, 'correct');
});

test('start() begins another level at question 1 with full lives', () => {
  const game = quarters();
  const { state } = game;
  game.press('7');                               // 2 + 5
  game.press('Enter');
  game.next();                                   // question 2 of Level 1
  miss(game);                                    // 2 lives
  game.press('3');
  game.start(LEVEL2);
  assert.equal(game.level, LEVEL2);
  assert.equal(game.state, state);               // still the same object
  assert.equal(state.phase, 'playing');
  assert.equal(state.question, 1);
  assert.equal(state.lives, 3);
  assert.equal(state.typed, '');
  assert.deepEqual(state.problem, { a: 4, b: 3, answer: 1 });
});

test('the game says which level it is playing, from the start', () => {
  assert.equal(quarters().level, LEVEL1);
  assert.equal(createGame(LEVEL2, () => 0.25).level, LEVEL2);
});

test('after start(), answers are as long as the new level allows', () => {
  const game = quarters();
  game.start(LEVEL2);
  assert.equal(game.press('4'), 'typed');
  assert.equal(game.press('5'), 'ignored');
  assert.equal(game.state.typed, '4');
});

test('start() unlocks a game that is out of lives, and restart() keeps the new level', () => {
  const game = quarters();
  runOut(game);
  assert.equal(game.state.phase, 'out');
  game.start(LEVEL2);
  assert.equal(game.state.phase, 'playing');
  runOut(game);                                   // 9 is wrong for 4 − 3 too
  game.restart();
  assert.equal(game.level, LEVEL2);
  assert.equal(game.state.phase, 'playing');
  assert.deepEqual(game.state.problem, { a: 4, b: 3, answer: 1 });
});

test('start() unlocks a correct answer too, and next() then does nothing', () => {
  const game = quarters();
  game.press('7');
  assert.equal(game.press('Enter'), 'correct');
  game.start(LEVEL2);
  assert.equal(game.state.phase, 'playing');
  game.next();
  assert.equal(game.state.question, 1);
});

// A clock the test moves on by hand, in ms.
const clock = () => {
  let t = 0;
  const now = () => t;
  now.tick = ms => { t += ms; };
  return now;
};

// Answer the problem on screen correctly; returns what the Enter did.
const solve = (game) => {
  for (const digit of String(game.state.problem.answer)) game.press(digit);
  return game.press('Enter');
};

// Miss whatever the problem is, with a digit that can't be its answer.
const missAny = (game) => {
  game.press(String((game.state.problem.answer + 1) % 10));
  return game.press('Enter');
};

// Answer every question of the run but the last, moving on after each.
const toLast = (game) => {
  while (game.state.question < game.level.problemsPerRun) {
    solve(game);
    game.next();
  }
};

test('a run is 20 different facts of the level, and the 20th correct answer finishes it', () => {
  for (const level of [LEVEL1, LEVEL2]) {
    const game = createGame(level);
    const asked = [];
    for (let q = 1; q <= 20; q++) {
      assert.equal(game.state.question, q);
      asked.push(game.state.problem);
      assert.equal(solve(game), q < 20 ? 'correct' : 'finished', `Level ${level.n}, question ${q}`);
      game.next();
    }
    assert.equal(new Set(asked.map(p => `${p.a} ${p.b}`)).size, 20);
    for (const p of asked) {
      assert.ok(level.facts.some(f => f.a === p.a && f.b === p.b && f.answer === p.answer), `${p.a}, ${p.b}`);
    }
    assert.ok(Number.isFinite(game.result.totalMs), 'timed by the real clock');
  }
});

test('the first problem is any of the level\'s facts, each equally likely', () => {
  for (const level of [LEVEL1, LEVEL2]) {
    const n = level.facts.length;
    const firsts = Array.from({ length: n }, (_, k) => createGame(level, () => nth(k, n)).state.problem);
    assert.deepEqual(firsts, level.facts);
  }
});

test('each later problem is drawn evenly from the facts not yet asked', () => {
  // The second problem after 7 + 5, for each of 99 equal slices of the
  // rng's range: every other fact once, and 7 + 5 never.
  const seconds = Array.from({ length: 99 }, (_, k) => {
    const game = createGame(LEVEL1, seq(nth(75, 100), nth(k, 99)));
    solve(game);
    game.next();
    return `${game.state.problem.a} ${game.state.problem.b}`;
  });
  assert.equal(new Set(seconds).size, 99);
  assert.ok(!seconds.includes('7 5'));
});

test('solved counts the run\'s correct answers, each from the moment it is right', () => {
  const game = threeProblems();
  assert.equal(game.state.solved, 0);
  miss(game);
  assert.equal(game.state.solved, 0);
  solve(game);
  assert.equal(game.state.solved, 1);            // during the green, before next()
  game.next();
  assert.equal(game.state.question, 2);
  assert.equal(game.state.solved, 1);
});

test('the finished run is locked, and next() does nothing', () => {
  const game = createGame(LEVEL2);
  toLast(game);
  assert.equal(game.state.question, 20);
  assert.equal(game.state.solved, 19);
  assert.equal(game.result, null);
  assert.equal(solve(game), 'finished');
  assert.equal(game.state.phase, 'finished');
  assert.equal(game.state.solved, 20);
  assertLocked(game);
  game.next();
  assert.equal(game.state.question, 20);
  assert.equal(game.state.phase, 'finished');
});

test('a third miss leaves the run unfinished, with no result', () => {
  const game = createGame(LEVEL1);
  toLast(game);
  missAny(game);
  missAny(game);
  assert.equal(missAny(game), 'out');
  assert.equal(game.result, null);
});

test('start() mid-run leaves it unfinished and begins a new run', () => {
  const game = createGame(LEVEL1);
  toLast(game);
  game.start(LEVEL2);
  assert.equal(game.result, null);
  assert.equal(game.state.question, 1);
  assert.equal(game.state.solved, 0);
  toLast(game);
  assert.equal(solve(game), 'finished');
  assert.equal(game.result.level, 2);
  assert.equal(game.result.problems.length, 20);
});

test('each run draws from all the level\'s facts again', () => {
  // Three runs of Level 2 ask 60 problems, more than its 55 facts.
  const game = createGame(LEVEL2);
  for (let run = 0; run < 3; run++) {
    if (run) game.start();
    toLast(game);
    assert.equal(solve(game), 'finished', `run ${run + 1}`);
  }
});

test('a problem is timed from when it is shown to its correct answer, misses included; the run from the first to the last', () => {
  const now = clock();
  const game = createGame(LEVEL1, seq(nth(75, 100), nth(23, 99)), now);   // 7 + 5, then 2 + 3
  now.tick(1000);
  miss(game);                                    // 9 is wrong for 7 + 5
  now.tick(500);
  solve(game);                                   // 1.5s, with 1 miss
  now.tick(570);                                 // the green and the slide-out
  game.next();                                   // 2 + 3 is shown
  now.tick(800);
  solve(game);                                   // 0.8s
  for (let q = 3; q <= 20; q++) {
    now.tick(570);
    game.next();
    now.tick(100);
    solve(game);
  }
  const { result } = game;
  assert.equal(result.level, 1);
  assert.equal(result.problems.length, 20);
  assert.deepEqual(result.problems[0], { a: 7, b: 5, ms: 1500, misses: 1 });
  assert.deepEqual(result.problems[1], { a: 2, b: 3, ms: 800, misses: 0 });
  for (const p of result.problems.slice(2)) assert.deepEqual([p.ms, p.misses], [100, 0]);
  // From Question 1 shown to the last Enter, feedback and slides included.
  assert.equal(result.totalMs, 1500 + 570 + 800 + 18 * (570 + 100));
  assert.equal(result.misses, 1);
});

test('the clock starts again when a run starts', () => {
  const now = clock();
  const game = createGame(LEVEL2, Math.random, now);
  now.tick(5000);                                // on the level selector, say
  game.start(LEVEL1);                            // Question 1 is shown
  now.tick(300);
  toLast(game);                                  // no time passes after the first answer
  solve(game);
  assert.equal(game.result.totalMs, 300);
  assert.equal(game.result.problems[0].ms, 300);
});

test('the result records the problem on screen when it was answered', () => {
  // The browser tests put known problems on screen; the record follows them.
  const game = createGame(LEVEL1);
  toLast(game);
  game.state.problem = { a: 3, b: 4, answer: 7 };
  solve(game);
  const { a, b, misses } = game.result.problems.at(-1);
  assert.deepEqual({ a, b, misses }, { a: 3, b: 4, misses: 0 });
});
