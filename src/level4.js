// Level 4: times tables (Levels 3–5 batch plan). Everything that makes this
// level different from the others lives here.
export const LEVEL4 = {
  n: 4,
  topic: 'Multiplication',
  name: 'Times tables',
  op: '×',                // the multiplication sign U+00D7, not the letter x
  word: 'times',
  sample: [6, 7],
  livesPerProblem: 3,
  maxAnswerLength: 2,
  problemsPerRun: 20,
  // a × b with a and b from 0 to 9: 100 facts, in the order 0 × 0, 0 × 1,
  // …, 0 × 9, 1 × 0, …, 9 × 9: by a, then by b. A run draws 20 of them,
  // each equally likely (game.js).
  facts: Array.from({ length: 10 }, (_, a) => Array.from({ length: 10 }, (_, b) => ({ a, b, answer: a * b }))).flat(),
  // Every answer this level can have, the 37 distinct products from 0 to 81
  // in numerical order; the answer box is sized to fit them all.
  possibleAnswers: [...new Set(Array.from({ length: 100 }, (_, i) => Math.floor(i / 10) * (i % 10)))]
    .sort((x, y) => x - y).map(String),
};
