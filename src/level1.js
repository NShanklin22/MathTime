// Level 1: single-digit addition. Everything that makes this level different
// from the others lives here.
export const LEVEL1 = {
  n: 1,
  topic: 'Addition',
  name: 'Single-digit addition',
  op: '+',
  word: 'plus',                // the operator, as screen readers hear it
  sample: [3, 4],              // the problem the level selector shows
  livesPerProblem: 3,
  maxAnswerLength: 2,
  makeProblem(rng) {
    const a = Math.floor(rng() * 10);
    const b = Math.floor(rng() * 10);
    return { a, b, answer: a + b };
  },
  // Every answer this level can have; the answer box is sized to fit them all.
  possibleAnswers: Array.from({ length: 19 }, (_, i) => String(i)),
};
