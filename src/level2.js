// Level 2: subtraction within 10 (Level 2 spec §1). Everything that makes
// this level different from the others lives here.
export const LEVEL2 = {
  n: 2,
  topic: 'Subtraction',
  name: 'Subtraction within 10',
  op: '−',                // the minus sign, not a hyphen
  word: 'minus',
  sample: [7, 3],
  livesPerProblem: 3,
  maxAnswerLength: 1,
  // a − b with a and b from 0 to 9 and b ≤ a. Each of the 55 facts is
  // equally likely, as each of Level 1's 100 is: picking a, then b, would
  // make "x − x = 0" more than a quarter of all problems. The facts are
  // numbered 0 to 54 in the order 0 − 0, 1 − 0, 1 − 1, 2 − 0, …: each a has
  // a + 1 of them, so the loop takes off whole a's and what is left is b.
  makeProblem(rng) {
    let fact = Math.floor(rng() * 55), a = 0;
    while (fact > a) fact -= ++a;
    return { a, b: fact, answer: a - fact };
  },
  possibleAnswers: Array.from({ length: 10 }, (_, i) => String(i)),
};
