// The column methods' rules (Levels 6–7 batch plan), with no DOM: the cells
// a problem is worked in, the order a column is written in, and which cells
// of a column are wrong. The game (game.js) plays a column level by its
// method; the board draws it.
//
// cells: the cells you write in. A big cell is an answer digit, a small one
//   a carry or borrow digit; `col` is its column, 0 to 2 from the left (the
//   third holds the operator beside the second number). `name` is what
//   screen readers hear. A cell holds '' or one digit.
// steps: the columns, worked right to left, one at a time. `cells` are the
//   column's cells, its answer digit first (Enter does nothing while that is
//   empty); `name` is the column's; `nav` says where each arrow key goes
//   from each cell.
// solve(a, b): the working, x, every digit of it.
// order(k, v, f): the cells of step k in working order, from the values v
//   and the cell f the cursor is on.
// wrong(k, v, x): the cells of step k that are wrong, in working order;
//   none means the column is right.
// Level 7 also has borrowed(v, f), backFromEmpty(v, f) and
// afterWrong(k, bad, x): see there.

const num = s => s === '' ? 0 : Number(s);

// Level 6: column addition with carrying. The third column holds the "+"
// beside the second number and the hundreds of the answer.
export const COLUMN_ADD = {
  solve(a, b) {
    const a1 = Math.floor(a / 10), a0 = a % 10, b1 = Math.floor(b / 10), b0 = b % 10;
    const ones = a0 + b0, carry = ones >= 10 ? 1 : 0, tens = a1 + b1 + carry;
    return { O: ones % 10, C: carry, T: tens % 10, H: tens >= 10 ? 1 : 0 };
  },
  // Solid: always written in. Dashed: written in if the working needs it,
  // there for every problem, so they give nothing away.
  cells: [
    { id: 'H', kind: 'big', col: 0, opt: true, name: 'Hundreds, answer' },
    { id: 'T', kind: 'big', col: 1, name: 'Tens, answer' },
    { id: 'O', kind: 'big', col: 2, name: 'Ones, answer' },
    { id: 'C', kind: 'small', col: 1, name: 'Tens, carry' },
  ],
  // A column at a time, right to left; in each, the digit, then where its
  // ten goes: up over the tens out of the ones, straight into the hundreds
  // out of the tens. Leaving that cell empty says "nothing to carry".
  steps: [
    { cells: ['O', 'C'], name: 'Ones', nav: { O: { ArrowUp: 'C', ArrowLeft: 'C' }, C: { ArrowDown: 'O', ArrowRight: 'O' } } },
    { cells: ['T', 'H'], name: 'Tens', nav: { T: { ArrowLeft: 'H' }, H: { ArrowRight: 'T' } } },
  ],
  order: k => COLUMN_ADD.steps[k].cells,
  // A column is right when its digit and its carry both are (a skipped
  // carry is wrong). A 0 carry may be written or left out.
  wrong(k, v, x) {
    if (k === 0) return [v.O !== x.O + '' && 'O', num(v.C) !== x.C && 'C'].filter(Boolean);
    return [v.T !== x.T + '' && 'T', num(v.H) !== x.H && 'H'].filter(Boolean);
  },
};

// Level 7: column subtraction with borrowing (decomposition), the "−" in
// the third column.
export const COLUMN_SUB = {
  // `need`: the ones borrow. B is the tens digit less the 1 borrowed.
  solve(a, b) {
    const a1 = Math.floor(a / 10), a0 = a % 10, b1 = Math.floor(b / 10), b0 = b % 10;
    const need = a0 < b0;
    return { need, B: a1 - 1, O: a0 + (need ? 10 : 0) - b0, T: a1 - (need ? 1 : 0) - b1 };
  },
  cells: [
    { id: 'T', kind: 'big', col: 1, name: 'Tens, answer' },
    { id: 'O', kind: 'big', col: 2, name: 'Ones, answer' },
    { id: 'B', kind: 'small', col: 1, name: 'Tens, borrow: the new tens digit' },
  ],
  // The ones, then the tens. To borrow, tap the tens digit (or its cell,
  // or press Up): it is struck through and the cursor goes up into the
  // cell over it, where you write what it becomes. A small 1 then goes
  // before the ones digit and the cursor comes back down to the ones
  // answer. Leave the borrow cell empty and the strike is taken back.
  steps: [
    { cells: ['O', 'B'], name: 'Ones', nav: { O: { ArrowUp: 'B' }, B: { ArrowDown: 'O', ArrowRight: 'O' } } },
    { cells: ['T'], name: 'Tens', nav: {} },
  ],
  // A borrow is made while the new tens digit is written, or the cursor is
  // in its cell: the tens digit is struck through.
  borrowed: (v, f) => v.B !== '' || f === 'B',
  order: (k, v, f) => k ? ['T'] : COLUMN_SUB.borrowed(v, f) ? ['B', 'O'] : ['O'],
  // Backspace in an empty borrow cell takes the borrow back: the cursor
  // goes to the ones answer, or, with that written, hides. Returns where
  // the cursor goes, or null when Backspace does nothing.
  backFromEmpty(v, f) {
    if (f !== 'B') return null;
    return { focus: v.O === '' ? 'O' : null };
  },
  // A borrow made where none is needed is taken back for you: the strike
  // goes, and the ones digit, if right, stays. Called after a wrong check
  // of step k, whose wrong cells `bad` are cleared; returns where the
  // cursor goes and what was wrong, or null to leave it on the first wrong cell.
  afterWrong(k, bad, x) {
    if (k !== 0 || x.need || bad[0] !== 'B') return null;
    return { focus: bad.includes('O') ? 'O' : null, what: 'no borrow needed' };
  },
  // The ones column is right only if it is worked: the borrow made when,
  // and only when, it is needed, the new tens digit right, and the ones
  // digit. A right digit with no borrow is wrong (the level is the method):
  // the borrow cell is the wrong one, and the digit stays.
  wrong(k, v, x) {
    if (k === 1) return v.T !== x.T + '' ? ['T'] : [];
    const borrowWrong = x.need ? v.B !== x.B + '' : v.B !== '';
    return [borrowWrong && 'B', v.O !== x.O + '' && 'O'].filter(Boolean);
  },
};

// A column level's pick (game.js): the index in `left`, the facts not yet
// asked, of the next problem. Whether it `needs` the carry or borrow is
// drawn first, half and half (rng() below 0.5: it does), then one of the
// facts left of that kind, each equally likely (batch plan). When none of
// that kind is left, it is one of the other kind.
export function pickHalf(needs) {
  return (left, rng) => {
    const need = rng() < 0.5;
    const of = kind => {
      const at = [];
      for (let i = 0; i < left.length; i++) if (needs(left[i]) === kind) at.push(i);
      return at;
    };
    let at = of(need);
    if (!at.length) at = of(!need);
    return at[Math.floor(rng() * at.length)];
  };
}
