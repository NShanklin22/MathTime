// Level 1: single-digit addition. Everything that makes this level different
// from later ones lives here.
export const LEVEL1 = {
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
