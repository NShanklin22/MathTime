import { COLUMN_ADD, pickHalf } from './columns.js';

// Level 6: column addition with carrying (Levels 6–7 batch plan).
// Everything that makes this level different from the others lives here;
// the method's rules are in columns.js.
export const LEVEL6 = {
  n: 6,
  k: 2,                        // its number within its topic, as shown: "Addition 2"
  topic: 'Addition',
  name: 'Column addition',
  op: '+',
  word: 'plus',
  sample: [47, 38],
  livesPerProblem: 3,
  problemsPerRun: 20,
  kind: 'column',              // worked on the column board, by its method
  method: COLUMN_ADD,
  // a + b with a and b from 10 to 99: 8100 facts, in the order 10 + 10,
  // 10 + 11, …, 10 + 99, 11 + 10, …, 99 + 99: by a, then by b.
  facts: Array.from({ length: 90 }, (_, i) => 10 + i).flatMap(a =>
    Array.from({ length: 90 }, (_, j) => 10 + j).map(b => ({ a, b, answer: a + b }))),
  // Half the problems carry in the ones (batch plan), though 45 in every
  // 100 facts do: a carry or not is drawn first, then the numbers.
  pick: pickHalf(f => f.a % 10 + f.b % 10 >= 10),
};
