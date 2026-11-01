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
  // numbered in order, a's from 0 to a.
  makeProblem(rng) {
    let n = Math.floor(rng() * 55), a = 0;
    while (n > a) n -= ++a;
    return { a, b: n, answer: a - n };
  },
  possibleAnswers: Array.from({ length: 10 }, (_, i) => String(i)),
};
