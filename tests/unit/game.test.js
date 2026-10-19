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
const sevenPlusFive = () => createGame(LEVEL1, seq(0.75, 0.55));

test('Level 1 problems use whole numbers 0 to 9', () => {
  assert.deepEqual(LEVEL1.makeProblem(seq(0, 0)), { a: 0, b: 0, answer: 0 });
  assert.deepEqual(LEVEL1.makeProblem(seq(0.999, 0.999)), { a: 9, b: 9, answer: 18 });
});

test('Level 1 lists every possible answer, 0 to 18, as strings', () => {
  assert.equal(LEVEL1.possibleAnswers.length, 19);
  assert.equal(LEVEL1.possibleAnswers[0], '0');
  assert.equal(LEVEL1.possibleAnswers[18], '18');
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

test('next() moves to the next question with full lives and an empty answer', () => {
  const game = sevenPlusFive();
  game.press('9');
  game.press('Enter');            // wrong: 2 lives left
  game.press('1');
  game.press('2');
  game.press('Enter');            // correct
  game.next();
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.question, 2);
  assert.equal(game.state.lives, 3);
  assert.equal(game.state.typed, '');
});

test('a wrong answer clears the answer and costs a life, same problem', () => {
  const game = sevenPlusFive();
  game.press('9');
  assert.equal(game.press('Enter'), 'wrong');
  assert.equal(game.state.typed, '');
  assert.equal(game.state.lives, 2);
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.problem.answer, 12);
});

test('the third miss ends the problem; restart() goes back to question 1', () => {
  const game = sevenPlusFive();
  game.press('1'); game.press('2'); game.press('Enter');
  game.next();                    // question 2
  for (let i = 0; i < 2; i++) { game.press('9'); game.press('Enter'); }
  game.press('9');
  assert.equal(game.press('Enter'), 'out');
  assert.equal(game.state.phase, 'out');
  assert.equal(game.press('1'), 'ignored');
  game.restart();
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.question, 1);
  assert.equal(game.state.lives, 3);
});

test('unknown keys are ignored', () => {
  const game = sevenPlusFive();
  assert.equal(game.press('a'), 'ignored');
  assert.equal(game.press('Tab'), 'ignored');
});
