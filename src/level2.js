// Level 2: subtraction within 10 (Level 2 spec §1). Everything that makes
// this level different from the others lives here.
export const LEVEL2 = {
  n: 2,
  free: true,             // played signed out too (accounts spec §2)
  k: 1,                   // its number within its topic, as shown: "Subtraction 1"
  topic: 'Subtraction',
  name: 'Subtraction within 10',
  op: '−',                // the minus sign, not a hyphen
  word: 'minus',
  sample: [7, 3],
  livesPerProblem: 3,
  maxAnswerLength: 1,
  problemsPerRun: 20,
  // a − b with a and b from 0 to 9 and b ≤ a: 55 facts, in the order 0 − 0,
  // 1 − 0, 1 − 1, 2 − 0, … A run draws from them, each equally likely
  // (game.js), as from Level 1's 100: picking a, then b, would make
  // "x − x = 0" more than a quarter of all problems.
  facts: Array.from({ length: 10 }, (_, a) => Array.from({ length: a + 1 }, (_, b) => ({ a, b, answer: a - b }))).flat(),
  possibleAnswers: Array.from({ length: 10 }, (_, i) => String(i)),
};
