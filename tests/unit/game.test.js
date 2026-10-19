import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL1 } from '../../src/level1.js';
import { createGame } from '../../src/game.js';

// An rng that returns the given values in order, then repeats them.
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};
// Math.floor(0.75 * 10) = 7 and Math.floor(0.55 * 10) = 5, so 7 + 5.
// This rng repeats, so every problem is 7 + 5: use it when the test does not
// care whether a new problem was drawn.
const sevenPlusFive = () => createGame(LEVEL1, seq(0.75, 0.55));
// Problems come out as 7 + 5, then 2 + 3, then 1 + 9. They are all different,
// so a test can tell "a new problem was drawn" from "the same problem stayed".
const threeProblems = () => createGame(LEVEL1, seq(0.75, 0.55, 0.25, 0.35, 0.15, 0.95));
// The first problem is 2 + 3 = 5, a single-digit answer.
const twoPlusThree = () => createGame(LEVEL1, seq(0.25, 0.35));

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

test('Level 1 problems use whole numbers 0 to 9', () => {
  assert.deepEqual(LEVEL1.makeProblem(seq(0, 0)), { a: 0, b: 0, answer: 0 });
  assert.deepEqual(LEVEL1.makeProblem(seq(0.999, 0.999)), { a: 9, b: 9, answer: 18 });
});

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
