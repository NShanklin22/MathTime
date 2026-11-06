// Level 5: division facts (Levels 3–5 batch plan). Everything that makes
// this level different from the others lives here.
export const LEVEL5 = {
  n: 5,
  k: 1,                   // its number within its topic, as shown: "Division 1"
  topic: 'Division',
  name: 'Division facts',
  op: '÷',                // the division sign U+00F7
  word: 'divided by',
  sample: [56, 8],
  livesPerProblem: 3,
  maxAnswerLength: 1,
  problemsPerRun: 20,
  // (q × b) ÷ b with b from 1 to 9 and q from 0 to 9: 90 facts, each Level 4
  // multiplication undone, so every answer is a whole number from 0 to 9. In
  // the order 0 ÷ 1, 1 ÷ 1, …, 9 ÷ 1, 0 ÷ 2, 2 ÷ 2, …, 81 ÷ 9: by b, then
  // by q. A run draws 20 of them, each equally likely (game.js).
  facts: Array.from({ length: 9 }, (_, i) => i + 1).flatMap(b =>
    Array.from({ length: 10 }, (_, q) => ({ a: q * b, b, answer: q }))),
  // Every answer this level can have, 0 to 9; the answer box is sized to fit them all.
  possibleAnswers: Array.from({ length: 10 }, (_, i) => String(i)),
};
