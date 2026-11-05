// Level 3: subtraction past 10 (Level 3 spec §1). Everything that makes
// this level different from the others lives here.
export const LEVEL3 = {
  n: 3,
  topic: 'Subtraction',
  name: 'Subtraction past 10',
  op: '−',                // the minus sign, not a hyphen
  word: 'minus',
  sample: [13, 5],
  livesPerProblem: 3,
  maxAnswerLength: 1,
  problemsPerRun: 20,
  // a − b with a from 10 to 18, b from 1 to 9 and an answer of at most 9:
  // the 45 subtractions whose addition, in Level 1, crosses 10. In the
  // order 10 − 1, 10 − 2, …, 10 − 9, 11 − 2, …, 18 − 9: by a, then by b.
  // (The spec calls a "m".) A run draws 20 of them, each equally likely
  // (game.js).
  facts: Array.from({ length: 9 }, (_, i) => 10 + i).flatMap(a =>
    Array.from({ length: 9 }, (_, j) => j + 1).filter(b => a - b <= 9).map(b => ({ a, b, answer: a - b }))),
  // Every answer this level can have, 1 to 9; the answer box is sized to fit them all.
  possibleAnswers: Array.from({ length: 9 }, (_, i) => String(i + 1)),
};
