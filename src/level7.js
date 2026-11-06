import { COLUMN_SUB, pickHalf } from './columns.js';

// Level 7: column subtraction with borrowing (Levels 6–7 batch plan).
// Everything that makes this level different from the others lives here;
// the method's rules are in columns.js.
export const LEVEL7 = {
  n: 7,
  topic: 'Subtraction',
  name: 'Column subtraction',
  op: '−',                // the minus sign, not a hyphen
  word: 'minus',
  sample: [52, 27],
  livesPerProblem: 3,
  problemsPerRun: 20,
  kind: 'column',          // worked on the column board, by its method
  method: COLUMN_SUB,
  // a − b with a and b from 10 to 99 and b ≤ a, so the answer is 0 or
  // more: 4095 facts, in the order 10 − 10, 11 − 10, 11 − 11, 12 − 10, …,
  // 99 − 99: by a, then by b.
  facts: Array.from({ length: 90 }, (_, i) => 10 + i).flatMap(a =>
    Array.from({ length: a - 9 }, (_, j) => 10 + j).map(b => ({ a, b, answer: a - b }))),
  // Half the problems borrow for the ones (batch plan), though 1620 of the
  // 4095 facts do: a borrow or not is drawn first, then the numbers.
  pick: pickHalf(f => f.a % 10 < f.b % 10),
};
