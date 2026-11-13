import { test, expect } from './fixtures.js';
import {
  open, levelRow, typeKeys, setColumns, work, finishColumnRun, boardCell, written, againstMockup, expectSame,
  shaken, strikes, listen, flashFor, rect,
} from './helpers.js';

// Level 7, column subtraction with borrowing (Levels 6–7 batch plan), on
// the column board (board.js) by its method (columns.js). The board is the
// approved mockup's play screen moved into the game, so it is compared with
// the mockup pixel for pixel, in each of the mockup's fixed states; the rest
// is how it plays. The sample, 52 − 27, borrows for the ones: the 5 is
// struck and becomes 4, the 2 becomes 12, and the answer is 25. 86 − 34
// needs no borrow: 52.

const field = page => page.locator('#ans');
const focus = page => page.evaluate(() => window.mathtime.game.state.focus);
// The marks of a borrow: the stroke through the tens digit, the struck
// digit itself, the small 1 before the ones digit, and the up chevron that
// shows how to borrow.
const strike = page => page.locator('.board .strike');
const tens = page => page.locator('.board .dg').first();
const small1 = page => page.locator('.board .small1');
const cue = page => page.locator('.board .cue');
async function borrowShown(page, on) {
  const has = on ? expect(strike(page)) : expect(strike(page)).not;
  await has.toHaveClass(/\bon\b/);
  await (on ? expect(tens(page)) : expect(tens(page)).not).toHaveClass(/\bstruck\b/);
}

test.beforeEach(async ({ page }) => {
  await open(page, 7);
});

test('chosen from the selector, Level 7 sets a two-digit difference on the column board, and screen readers hear it', async ({ page }) => {
  await expect(page.locator('.board .qlabel')).toBeVisible();   // the board itself is a zero-size box: all it holds is placed
  await expect(page.locator('#eq')).toBeHidden();
  const { a, b, answer } = await page.evaluate(() => window.mathtime.game.state.problem);
  for (const n of [a, b]) {
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(99);
  }
  expect(b).toBeLessThanOrEqual(a);
  expect(answer).toBe(a - b);
  await expect(page.locator('#status')).toHaveText(`Question 1 of 20: ${a} minus ${b}`);
  await expect(page.locator('.board .qlabel')).toHaveText('Question 1 of 20');
  await expect(page.locator('.board .dg:not(.small1)')).toHaveText([...String(a), ...String(b)]);
  await expect(page.locator('.board .op')).toHaveText('−');
  await expect(page.locator('.board .cell')).toHaveCount(3);
  await expect(page.locator('.crumbs .here')).toHaveText('Subtraction 3');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute('aria-label', 'Ones, answer');
  await expect(page.getByRole('button', { name: 'Check the column' })).toBeVisible();
  // The way to borrow shows on every problem, so it gives nothing away.
  await expect(cue(page)).toBeVisible();
  await borrowShown(page, false);
  await setColumns(page, 52, 27);
  await page.evaluate(() => window.mathtime.board.announceProblem(window.mathtime.game.state));
  await expect(page.locator('#status')).toHaveText('Question 1 of 20: 52 minus 27');
});

test.describe('the board is the mockup\'s, pixel for pixel, at every size', () => {
  test('nothing written: 52 − 27, the cursor on the ones, the chevron in the borrow cell', async ({ page }) => {
    await setColumns(page, 52, 27);
    expectSame(await againstMockup(page, 7, 'empty'));
  });

  test('part way: the borrow made, the 5 struck and 4 written over it, the cursor on the ones', async ({ page }) => {
    await setColumns(page, 52, 27, { cells: { B: '4' }, focus: 'O' });
    expectSame(await againstMockup(page, 7, 'partial'));
  });

  test('a wrong column, after its red-line: the ones digit without the borrow', async ({ page }) => {
    await setColumns(page, 52, 27, { cells: { O: '5' }, focus: null });
    await typeKeys(page, ['Enter']);
    await shaken(page);
    expectSame(await againstMockup(page, 7, 'wrong', { ready: shaken }));
  });

  test('done: 25, every column green, the borrow\'s marks too', async ({ page }) => {
    await setColumns(page, 52, 27, { cells: { B: '4', O: '5', T: '2' }, done: [true, true], step: 2, focus: null, phase: 'correct', solved: 1 });
    expectSame(await againstMockup(page, 7, 'done'));
  });

  // The comparison itself can tell, at every size: one digit off, and the
  // whole board one device pixel to the right.
  test('a single digit\'s difference shows: 52 − 28 is not the mockup\'s 52 − 27', async ({ page }) => {
    await setColumns(page, 52, 28);
    for (const { at, count } of await againstMockup(page, 7, 'empty')) expect(count, at).toBeGreaterThan(0);
  });

  test('the board one device pixel off shows', async ({ page }) => {
    await setColumns(page, 52, 27);
    const shift = p => p.evaluate(() => {
      const board = document.querySelector('.board');
      board.style.left = `${parseFloat(board.style.left) + 1 / devicePixelRatio}px`;
    });
    for (const { at, count } of await againstMockup(page, 7, 'empty', { tweak: shift })) expect(count, at).toBeGreaterThan(0);
  });
});

test('a whole problem worked right: Up borrows, the new tens digit, the ones, then the tens', async ({ page }) => {
  await setColumns(page, 52, 27);
  const said = await listen(page);
  await typeKeys(page, ['ArrowUp']);
  await borrowShown(page, true);
  await expect(cue(page)).toBeHidden();
  await expect(boardCell(page, 'B')).toHaveClass(/\bfocus\b/);
  await expect(field(page)).toHaveAttribute('aria-label', 'Tens, borrow: the new tens digit');
  await expect(small1(page)).not.toHaveClass(/\bon\b/);
  await typeKeys(page, ['4']);
  await expect(written(page, 'B')).toHaveText('4');
  await expect(small1(page)).toHaveClass(/\bon\b/);                    // the 2 is now 12
  await expect(boardCell(page, 'O')).toHaveClass(/\bfocus\b/);         // back down to the ones
  await typeKeys(page, ['5']);
  await expect(field(page)).toHaveAttribute('aria-label', 'Ones column written: Enter checks it');
  await typeKeys(page, ['Enter']);
  await expect(page.locator('#status')).toHaveText('Right. Tens column.');
  for (const id of ['O', 'B']) await expect(boardCell(page, id)).toHaveClass(/\bok\b/);
  await expect(strike(page)).toHaveClass(/\bok\b/);
  await expect(small1(page)).toHaveClass(/\bok\b/);
  await expect(boardCell(page, 'T')).toHaveClass(/\bfocus\b/);
  await expect(field(page)).toHaveAttribute('aria-label', 'Tens, answer');
  await expect(page.locator('.board .hit')).toBeHidden();             // the borrow is done with
  await typeKeys(page, ['2', 'Enter']);
  await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
  const next = await page.evaluate(() => window.mathtime.game.state.problem);
  expect(next.answer).toBe(next.a - next.b);
  expect(await said()).toEqual(['Right. Tens column.', 'Correct', `Question 2 of 20: ${next.a} minus ${next.b}`]);
  await borrowShown(page, false);
  await expect(small1(page)).not.toHaveClass(/\bon\b/);
  await expect(page.locator('.board .cell.ok')).toHaveCount(0);
  await expect(cue(page)).toBeVisible();
});

test('tapping the tens digit borrows, as Up does; tapping the ones cell with the borrow cell empty takes it back', async ({ page }) => {
  await setColumns(page, 52, 27);
  const digit = await rect(page, '.board .dg', 0);
  await page.mouse.click(digit.left + digit.width / 2, digit.top + digit.height / 2);
  expect(await focus(page)).toBe('B');
  await borrowShown(page, true);
  await boardCell(page, 'O').click();
  expect(await focus(page)).toBe('O');
  await borrowShown(page, false);
  await boardCell(page, 'B').click();                   // its cell borrows too
  expect(await focus(page)).toBe('B');
  await borrowShown(page, true);
  await expect(field(page)).toBeFocused();              // taps never take the focus
  await typeKeys(page, ['4', '5', 'Enter']);
  await boardCell(page, 'T').click();
  expect(await focus(page)).toBe('T');
  await page.mouse.click(digit.left + digit.width / 2, digit.top + digit.height / 2);   // the ones are locked
  expect(await focus(page)).toBe('T');
  await borrowShown(page, true);
});

test('the arrows: Up into the borrow cell, Down or Right back to the ones; the tens have nowhere to go', async ({ page }) => {
  await setColumns(page, 52, 27);
  for (const [key, to] of [['ArrowLeft', 'O'], ['ArrowUp', 'B'], ['ArrowDown', 'O'], ['ArrowUp', 'B'], ['ArrowRight', 'O']]) {
    await typeKeys(page, [key]);
    expect(await focus(page), key).toBe(to);
  }
  await borrowShown(page, false);                       // left empty, the borrow cell is no borrow
  await typeKeys(page, ['ArrowUp', '4', '5', 'Enter']);
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    await typeKeys(page, [key]);
    expect(await focus(page), key).toBe('T');
  }
});

test('a missing borrow is wrong: only the borrow cell is struck, the ones digit stays, and the borrow starts', async ({ page }) => {
  await setColumns(page, 52, 27);
  const shook = await strikes(page);
  await typeKeys(page, ['5', 'Enter']);
  await expect(page.locator('#status')).toHaveText('Wrong: Tens, borrow: the new tens digit. 2 lives left');
  expect(await shook()).toEqual(['B']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  await expect(written(page, 'O')).toHaveText('5');
  expect(await focus(page)).toBe('B');
  await borrowShown(page, true);
  await expect(field(page)).toHaveAttribute('aria-label', 'Tens, borrow: the new tens digit');
  await typeKeys(page, ['4', 'Enter']);
  await expect(page.locator('#status')).toHaveText('Right. Tens column.');
});

// The cursor stays on the board: on the right ones digit, shown written
// (amber), which typing replaces.
test('a borrow where none is needed is wrong and taken back for you: the strike goes, the cursor on the right ones digit', async ({ page }) => {
  await setColumns(page, 86, 34);
  const shook = await strikes(page);
  await typeKeys(page, ['ArrowUp', '7', '2']);
  await borrowShown(page, true);
  await typeKeys(page, ['Enter']);
  await expect(page.locator('#status')).toHaveText('Wrong: no borrow needed. 2 lives left');
  expect(await shook()).toEqual(['B']);
  await borrowShown(page, false);
  await expect(small1(page)).not.toHaveClass(/\bon\b/);
  await expect(written(page, 'B')).toHaveText('');
  await expect(written(page, 'O')).toHaveText('2');
  expect(await focus(page)).toBe('O');
  await expect(boardCell(page, 'O')).toHaveClass(/\bfocus\b/);
  await expect(boardCell(page, 'O')).toHaveClass(/\bfilled\b/);
  await expect(written(page, 'O')).toHaveCSS('color', 'rgb(255, 214, 107)');   // amber
  await expect(field(page)).toHaveAttribute('aria-label', 'Ones, answer');
  await expect(cue(page)).toBeVisible();
  await typeKeys(page, ['Enter']);
  await expect(page.locator('#status')).toHaveText('Right. Tens column.');
  // A wrong ones digit with it: the cursor on the ones digit, emptied.
  await setColumns(page, 86, 34);
  await typeKeys(page, ['ArrowUp', '7', '3', 'Enter']);
  await expect(page.locator('#status')).toHaveText('Wrong: no borrow needed. 2 lives left');
  expect(await focus(page)).toBe('O');
  await expect(written(page, 'O')).toHaveText('');
});

// As on paper, a 0 in the tens may be left out: 52 − 47 = 5.
test('the tens may be left empty where they are 0: Enter checks the empty cell as 0, and it is rubbed out', async ({ page }) => {
  await setColumns(page, 52, 47);
  const said = await listen(page);
  await typeKeys(page, ['ArrowUp', '4', '5', 'Enter']);
  await expect(page.locator('#status')).toHaveText('Right. Tens column.');
  const done = await page.evaluate(() => new Promise(resolve => {
    document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    // Once the frames have faded (0.2s), before the swap (0.32s): the frames'
    // own opacity, whatever the board's fade.
    setTimeout(() => {
      const frame = id => getComputedStyle(document.querySelector(`.board .cell[data-tap="${id}"] .frame`)).opacity;
      resolve({ T: frame('T'), O: frame('O'), B: frame('B'), status: document.querySelector('#status').textContent });
    }, 280);
  }));
  expect(done).toEqual({ T: '0', O: '1', B: '0', status: 'Correct' });
  await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
  expect((await said()).slice(0, 2)).toEqual(['Right. Tens column.', 'Correct']);
  // Held still: the empty tens cell, checked right, has no frame; the ones' box is whole.
  await setColumns(page, 52, 47, { cells: { B: '4', O: '5' }, done: [true, true], step: 2, focus: null, phase: 'correct', solved: 1 });
  await expect(boardCell(page, 'T').locator('.frame')).toHaveCSS('opacity', '0');
  await expect(boardCell(page, 'O').locator('.frame')).toHaveCSS('opacity', '1');
  await expect(boardCell(page, 'O').locator('.frame')).toHaveCSS('border-left-style', 'solid');
  // A 0 written there is right too, and stays.
  await setColumns(page, 52, 47);
  await typeKeys(page, ['ArrowUp', '4', '5', 'Enter', '0']);
  await expect(written(page, 'T')).toHaveText('0');
  await typeKeys(page, ['Enter']);
  await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
});

test('an empty tens cell where the tens are not 0 is a wrong check: the empty tens cell is struck, a life goes, the cursor in the tens', async ({ page }) => {
  await setColumns(page, 52, 27);
  await typeKeys(page, ['ArrowUp', '4', '5', 'Enter']);
  const shook = await strikes(page);
  await typeKeys(page, ['Enter']);
  await expect(page.locator('#status')).toHaveText('Wrong: Tens, answer. 2 lives left');
  expect(await shook()).toEqual(['T']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  expect(await focus(page)).toBe('T');
  await expect(boardCell(page, 'T')).toHaveClass(/\bfocus\b/);
  await expect(boardCell(page, 'T').locator('.frame')).toHaveCSS('opacity', '1');
  await expect(field(page)).toHaveAttribute('aria-label', 'Tens, answer');
  await typeKeys(page, ['2', 'Enter']);
  await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
});

test('the ones are not checked empty: Enter with the ones answer empty does nothing', async ({ page }) => {
  await setColumns(page, 34, 34);
  expect(await flashFor(page, 'Enter')).toEqual([]);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  expect(await page.evaluate(() => window.mathtime.game.state.step)).toBe(0);
});

test('Backspace takes a borrow back: first its digit, then, with its cell empty, the strike', async ({ page }) => {
  await setColumns(page, 52, 27);
  await typeKeys(page, ['ArrowUp', '4']);
  expect(await focus(page)).toBe('O');
  await typeKeys(page, ['Backspace']);
  await expect(written(page, 'B')).toHaveText('');
  expect(await focus(page)).toBe('B');
  await borrowShown(page, true);
  await expect(small1(page)).not.toHaveClass(/\bon\b/);
  await typeKeys(page, ['Backspace']);
  expect(await focus(page)).toBe('O');
  await borrowShown(page, false);
  await expect(cue(page)).toBeVisible();
  // With the ones written, the cursor hides instead.
  await typeKeys(page, ['5', 'ArrowUp', 'Backspace']);
  expect(await focus(page)).toBe(null);
  await borrowShown(page, false);
  await expect(written(page, 'O')).toHaveText('5');
});

test('three wrong checks are out of lives: back to the selector, Level 7 marked and focused', async ({ page }) => {
  await setColumns(page, 52, 27);
  const said = await listen(page);
  // A wrong ones digit and no borrow; after a miss the cursor is in the
  // borrow cell, so Down first.
  for (let i = 0; i < 3; i++) await typeKeys(page, ['ArrowDown', '9', 'Enter']);
  await expect(page.locator('.select')).toBeVisible();
  const missing = 'Wrong: Tens, borrow: the new tens digit.';
  expect(await said()).toEqual([`${missing} 2 lives left`, `${missing} 1 life left`, 'Out of lives', '']);
  await expect(levelRow(page, 7)).toHaveClass(/\bcurrent\b/);
  await expect(levelRow(page, 7)).toBeFocused();
});

test('a run of 20 finishes on the finish screen, its record kept, and Level 7\'s row is marked finished', async ({ page }) => {
  await finishColumnRun(page);
  await expect(page.getByRole('region', { name: 'Subtraction 3 complete', exact: true })).toBeVisible();
  const time = await page.locator('.finish .done-time').textContent();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.runs')));
  expect(kept.map(r => r.level)).toEqual([7]);
  expect(kept[0].problems).toHaveLength(20);
  for (const { a, b } of kept[0].problems) expect(b <= a && b >= 10 && a <= 99, `${a} − ${b}`).toBe(true);
  await page.locator('.finish .levels').click();
  await expect(levelRow(page, 7)).toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 7).locator('.best')).toHaveText(time);
  await expect(levelRow(page, 7)).toHaveAttribute('aria-label', `Subtraction, Level 3: Column subtraction. Finished, best ${time}.`);
});

test('a run goes on to a new problem after each right one, with the board drawn afresh', async ({ page }) => {
  await setColumns(page, 52, 27);
  await work(page);
  await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
  await work(page);
  await expect(page.locator('.board .qlabel')).toHaveText('Question 3 of 20');
  await expect(page.locator('.run span.done')).toHaveCount(2);
});

test('accepted keys flash their keypad key; Up, which has none, borrows and flashes nothing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await setColumns(page, 52, 27);
  const idle = () => expect(page.locator('.pad button.pressed')).toHaveCount(0);
  expect(await flashFor(page, 'ArrowUp')).toEqual([]);
  expect(await focus(page)).toBe('B');
  expect(await flashFor(page, 'Backspace'), 'takes the borrow back').toEqual(['Backspace']);
  await idle();
  expect(await focus(page)).toBe('O');
  expect(await flashFor(page, 'Backspace'), 'nothing to take back: ignored').toEqual([]);
  expect(await flashFor(page, '5')).toEqual(['5']);
  await idle();
  expect(await flashFor(page, 'Enter')).toEqual(['Enter']);
  expect(errors).toEqual([]);
});
