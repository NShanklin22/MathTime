import { test, expect } from '@playwright/test';
import {
  open, levelRow, typeKeys, setColumns, work, finishColumnRun, boardCell, written, againstMockup, expectSame,
  shaken, strikes, listen, flashFor, playColumnsTo,
} from './helpers.js';

// Level 6, column addition with carrying (Levels 6–7 batch plan), played on
// the column board (board.js) by its method (columns.js). The board is the
// approved mockup's play screen moved into the game, so it is compared with
// the mockup pixel for pixel, in each of the mockup's fixed states; the rest
// is how it plays. The sample, 47 + 38, carries in the ones: 85.

const field = page => page.locator('#ans');
const focus = page => page.evaluate(() => window.mathtime.game.state.focus);

test.beforeEach(async ({ page }) => {
  await open(page, 6);
});

test('chosen from the selector, Level 6 sets a two-digit sum on the column board, and screen readers hear it', async ({ page }) => {
  await expect(page.locator('.board .qlabel')).toBeVisible();   // the board itself is a zero-size box: all it holds is placed
  await expect(page.locator('#eq')).toBeHidden();
  const { a, b, answer } = await page.evaluate(() => window.mathtime.game.state.problem);
  for (const n of [a, b]) {
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(99);
  }
  expect(answer).toBe(a + b);
  await expect(page.locator('#status')).toHaveText(`Question 1 of 20: ${a} plus ${b}`);
  await expect(page.locator('.board .qlabel')).toHaveText('Question 1 of 20');
  await expect(page.locator('.board .dg')).toHaveText([...String(a), ...String(b)]);
  await expect(page.locator('.board .op')).toHaveText('+');
  await expect(page.locator('.board .cell')).toHaveCount(4);
  await expect(page.locator('.crumbs .here')).toHaveText('Addition 2');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await expect(page.locator('.run span')).toHaveCount(20);
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute('aria-label', 'Ones, answer');
  await expect(field(page)).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Check the column' })).toBeVisible();
  await setColumns(page, 47, 38);
  await page.evaluate(() => window.mathtime.board.announceProblem(window.mathtime.game.state));
  await expect(page.locator('#status')).toHaveText('Question 1 of 20: 47 plus 38');
});

test.describe('the board is the mockup\'s, pixel for pixel, at every size', () => {
  test('nothing written: 47 + 38, the cursor on the ones', async ({ page }) => {
    await setColumns(page, 47, 38);
    expectSame(await againstMockup(page, 6, 'empty'));
  });

  test('part way: the ones right with the carry written, the cursor on the tens', async ({ page }) => {
    await setColumns(page, 47, 38, { cells: { O: '5', C: '1' }, done: [true, false], step: 1, focus: 'T' });
    expectSame(await againstMockup(page, 6, 'partial'));
  });

  test('a wrong column, after its red-line: the ones digit with the carry skipped', async ({ page }) => {
    await setColumns(page, 47, 38, { cells: { O: '5' }, focus: 'C' });
    await typeKeys(page, ['Enter']);
    await shaken(page);
    expectSame(await againstMockup(page, 6, 'wrong', { ready: shaken }));
  });

  test('done: 85, every column green', async ({ page }) => {
    await setColumns(page, 47, 38, { cells: { O: '5', C: '1', T: '8' }, done: [true, true], step: 2, focus: null, phase: 'correct', solved: 1 });
    expectSame(await againstMockup(page, 6, 'done'));
  });

  // The comparison itself can tell: one digit off is caught at every size.
  test('a single digit\'s difference shows: 47 + 39 is not the mockup\'s 47 + 38', async ({ page }) => {
    await setColumns(page, 47, 39);
    for (const { at, count } of await againstMockup(page, 6, 'empty')) expect(count, at).toBeGreaterThan(0);
  });

  // And a change to the board's CSS: the mockup draws with its own rules,
  // not the build's, though it links the same styles.css. Here the green of
  // a right digit turns red in styles.css, for both pages.
  test('a changed board rule in styles.css shows: right digits red, not green', async ({ page }) => {
    const GREEN = '.board .cell.ok .v { color: var(--good);';
    await page.context().route('**/src/styles.css', async route => {
      const response = await route.fetch();
      const css = await response.text();
      if (!css.includes(GREEN)) throw new Error('the rule to change is not in styles.css');
      await route.fulfill({ response, body: css.replace(GREEN, '.board .cell.ok .v { color: #ff0000;') });
    });
    await open(page, 6);
    await setColumns(page, 47, 38, { cells: { O: '5', C: '1', T: '8' }, done: [true, true], step: 2, focus: null, phase: 'correct', solved: 1 });
    await expect(written(page, 'O')).toHaveCSS('color', 'rgb(255, 0, 0)');
    for (const { at, count } of await againstMockup(page, 6, 'done')) expect(count, at).toBeGreaterThan(0);
  });
});

test('a whole problem worked right, a column at a time: each turns green and the cursor moves left', async ({ page }) => {
  await setColumns(page, 47, 38);
  const said = await listen(page);
  await typeKeys(page, ['5']);
  await expect(written(page, 'O')).toHaveText('5');
  await expect(boardCell(page, 'C')).toHaveClass(/\bfocus\b/);          // then the carry
  await expect(field(page)).toHaveAttribute('aria-label', 'Tens, carry: typing it checks the column');
  await typeKeys(page, ['1']);                                           // the carry checks the column: no Enter
  await expect(written(page, 'C')).toHaveText('1');
  await expect(page.locator('#status')).toHaveText('Right. Tens column.');
  for (const id of ['O', 'C']) await expect(boardCell(page, id)).toHaveClass(/\bok\b/);
  for (const id of ['T', 'H']) await expect(boardCell(page, id)).not.toHaveClass(/\bok\b/);
  await expect(boardCell(page, 'T')).toHaveClass(/\bfocus\b/);
  await expect(field(page)).toHaveAttribute('aria-label', 'Tens, answer');
  await typeKeys(page, ['8']);
  await expect(field(page)).toHaveAttribute('aria-label', 'Hundreds, answer: typing it checks the column');   // where a carry would go
  await typeKeys(page, ['Enter']);                                       // nothing to carry: Enter checks the tens
  await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
  const next = await page.evaluate(() => window.mathtime.game.state.problem);
  expect(next.answer).toBe(next.a + next.b);
  expect(await said()).toEqual(['Right. Tens column.', 'Correct', `Question 2 of 20: ${next.a} plus ${next.b}`]);
  // The next problem starts afresh, nothing written, every life back.
  for (const id of ['H', 'T', 'O', 'C']) await expect(written(page, id)).toHaveText('');
  await expect(page.locator('.board .cell.ok')).toHaveCount(0);
  await expect(boardCell(page, 'O')).toHaveClass(/\bfocus\b/);
  await expect(page.locator('.run span.done')).toHaveCount(1);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
  await expect(field(page)).toHaveAttribute('aria-label', 'Ones, answer');
});

test('right: the answer is inked over, its segment fills, then the board fades out and the next fades in, 0.32s after the hundreds', async ({ page }) => {
  await setColumns(page, 75, 38);
  await typeKeys(page, ['3', '1', '1']);   // 113: the tens' carry goes straight into the hundreds, and checks the tens
  await expect(page.locator('#status')).toHaveText('Right. Tens column.');
  const t = await page.evaluate(() => new Promise(resolve => {
    const board = document.querySelector('.board');
    const log = { start: performance.now() };
    new MutationObserver(() => {
      if (board.classList.contains('out') && !log.out) log.out = performance.now();
      if (board.classList.contains('in') && !log.in) { log.in = performance.now(); resolve(log); }
    }).observe(board, { attributes: true, attributeFilter: ['class'] });
    document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
    // At once: the column's carry and the rest green, the written answer
    // (113) green only once the pen has closed its frame.
    log.green = [...board.querySelectorAll('.cell')].filter(c => c.classList.contains('ok')).map(c => c.dataset.tap).sort();
    log.pen = !!board.querySelector('svg.fx.pen');
    log.focus = board.querySelectorAll('.cell.focus').length;
    log.segments = document.querySelectorAll('.run span.done').length;
    setTimeout(() => { log.inked = [...board.querySelectorAll('.cell')].every(c => c.classList.contains('ok')); }, 225);
  }));
  expect(t.green, 'the earlier column green; the answer not yet').toEqual(['C', 'O']);
  expect(t.pen, 'the pen is tracing').toBe(true);
  expect(t.inked, 'every cell green once traced').toBe(true);
  expect(t.focus, 'no cursor').toBe(0);
  expect(t.segments, 'its segment filled').toBe(1);
  expect(Math.abs(t.out - t.start - 240), `fades out after ${(t.out - t.start).toFixed(0)}ms`).toBeLessThanOrEqual(40);
  expect(Math.abs(t.in - t.start - 320), `the next fades in after ${(t.in - t.start).toFixed(0)}ms`).toBeLessThanOrEqual(40);
  // Its fade-in over, the board lets go of it.
  await expect(page.locator('.board')).not.toHaveClass(/\bin\b/);
  await expect(page.locator('.board')).toHaveClass('board');
  await expect(page.locator('.board')).toHaveCSS('opacity', '1');
});

test('a skipped carry is wrong: only the carry cell is struck and clears, the digit stays, a life goes', async ({ page }) => {
  await setColumns(page, 47, 38);
  const shook = await strikes(page);
  await typeKeys(page, ['5', 'Enter']);
  await expect(page.locator('#status')).toHaveText('Wrong: Tens, carry. 2 lives left');
  expect(await shook()).toEqual(['C']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  await expect(page.locator('.lives svg.lost')).toHaveCount(1);
  await expect(written(page, 'O')).toHaveText('5');
  await expect(written(page, 'C')).toHaveText('');
  await expect(boardCell(page, 'C')).toHaveClass(/\bfocus\b/);
  await expect(field(page)).toHaveAttribute('aria-label', 'Tens, carry: typing it checks the column');
  await typeKeys(page, ['1']);                          // the carry checks the column
  await expect(page.locator('#status')).toHaveText('Right. Tens column.');
});

test('a wrong digit with the carry right: only the digit is struck through, the carry stays', async ({ page }) => {
  await setColumns(page, 47, 38);
  const shook = await strikes(page);
  await typeKeys(page, ['4', '1']);                     // the carry checks the column
  await expect(page.locator('#status')).toHaveText('Wrong: Ones, answer. 2 lives left');
  expect(await shook()).toEqual(['O']);
  await expect(written(page, 'O')).toHaveText('');
  await expect(written(page, 'C')).toHaveText('1');
  await expect(boardCell(page, 'O')).toHaveClass(/\bfocus\b/);
});

test('the arrows move between a column\'s digit and its carry; a tap moves the cursor to a cell of the column', async ({ page }) => {
  await setColumns(page, 47, 38);
  for (const [key, to, name] of [['ArrowUp', 'C', 'Tens, carry: typing it checks the column'], ['ArrowDown', 'O', 'Ones, answer'], ['ArrowLeft', 'C', 'Tens, carry: typing it checks the column'], ['ArrowRight', 'O', 'Ones, answer'], ['ArrowDown', 'O', 'Ones, answer']]) {
    await typeKeys(page, [key]);
    expect(await focus(page), key).toBe(to);
    await expect(boardCell(page, to)).toHaveClass(/\bfocus\b/);
    await expect(field(page)).toHaveAttribute('aria-label', name);
  }
  await boardCell(page, 'C').click();
  expect(await focus(page)).toBe('C');
  await expect(field(page)).toHaveAttribute('aria-label', 'Tens, carry: typing it checks the column');
  await boardCell(page, 'O').click();
  expect(await focus(page)).toBe('O');
  await boardCell(page, 'T').click();                   // another column: nothing
  expect(await focus(page)).toBe('O');
  await expect(field(page)).toBeFocused();              // taps never take the focus
  await typeKeys(page, ['5', '1']);                     // the carry checks the ones
  await boardCell(page, 'H').click();
  expect(await focus(page)).toBe('H');
  await expect(field(page)).toHaveAttribute('aria-label', 'Hundreds, answer: typing it checks the column');
  await boardCell(page, 'C').click();                   // the ones are locked
  expect(await focus(page)).toBe('H');
  await typeKeys(page, ['ArrowRight']);
  expect(await focus(page)).toBe('T');
  await expect(field(page)).toBeFocused();
});

test('Backspace clears the cell under the cursor, or the last one written before it', async ({ page }) => {
  await setColumns(page, 47, 38);
  await typeKeys(page, ['5', 'ArrowDown']);             // back onto the ones digit, written
  await typeKeys(page, ['Backspace']);
  await expect(written(page, 'O')).toHaveText('');
  expect(await focus(page)).toBe('O');
  await typeKeys(page, ['5']);                          // the cursor on to the empty carry
  expect(await focus(page)).toBe('C');
  await typeKeys(page, ['Backspace']);
  await expect(written(page, 'O')).toHaveText('');
  expect(await focus(page)).toBe('O');
});

test('three wrong checks are out of lives: back to the selector, Level 6 marked and focused', async ({ page }) => {
  await setColumns(page, 47, 38);
  const said = await listen(page);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('.select')).toBeVisible();
  expect(await said()).toEqual(['Wrong: Ones, answer. 2 lives left', 'Wrong: Ones, answer. 1 life left', 'Out of lives', '']);
  await expect(levelRow(page, 6)).toHaveClass(/\bcurrent\b/);
  await expect(levelRow(page, 6)).toBeFocused();
  await levelRow(page, 6).click();
  await expect(page.locator('.board .qlabel')).toHaveText('Question 1 of 20');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
});

test('Esc and "Levels" go back to the selector, even during the green; nothing of the run carries on', async ({ page }) => {
  await setColumns(page, 47, 38);
  await page.keyboard.press('Escape');
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 6)).toBeFocused();
  await levelRow(page, 6).click();
  await page.locator('.crumbs .back').click();
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 6)).toHaveClass(/\bcurrent\b/);
  await page.waitForTimeout(450);                       // the tap's double tap (selector.js)
  await levelRow(page, 6).click();
  await expect(page.locator('.select')).toBeHidden();
  await setColumns(page, 47, 38);
  await typeKeys(page, ['5', '1', '8', 'Enter']);
  await page.keyboard.press('Escape');                  // within the 0.32s lock
  await expect(page.locator('.select')).toBeVisible();
  await levelRow(page, 6).click();
  await page.waitForTimeout(800);                       // past when the fade would have been
  await expect(page.locator('.board .qlabel')).toHaveText('Question 1 of 20');
  await expect(page.locator('.board')).not.toHaveClass(/\b(out|in)\b/);
  await expect(page.locator('#status')).toHaveText(/^Question 1 of 20: \d\d plus \d\d$/);
});

test('a run of 20 finishes on the finish screen, its record kept, and Level 6\'s row is marked finished', async ({ page }) => {
  await finishColumnRun(page);
  await expect(page.getByRole('region', { name: 'Addition 2 complete', exact: true })).toBeVisible();
  await expect(page.locator('.finish .done-title')).toHaveText('Addition 2 complete');
  const time = await page.locator('.finish .done-time').textContent();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('mathtime.runs')));
  expect(kept.map(r => r.level)).toEqual([6]);
  expect(kept[0].problems).toHaveLength(20);
  for (const { a, b } of kept[0].problems) expect(a >= 10 && a <= 99 && b >= 10 && b <= 99, `${a} + ${b}`).toBe(true);
  await page.locator('.finish .levels').click();
  await expect(page.locator('.select')).toBeVisible();
  await expect(levelRow(page, 6)).toHaveClass(/\bfinished\b/);
  await expect(levelRow(page, 6).locator('.best')).toHaveText(time);
  await expect(levelRow(page, 6)).toHaveAttribute('aria-label', `Addition, Level 2: Column addition. Finished, best ${time}.`);
});

test('"Again" on the finish screen starts Level 6 afresh', async ({ page }) => {
  await finishColumnRun(page);
  await page.locator('.finish .again').click();
  await expect(page.locator('.board .qlabel')).toBeVisible();   // the board itself is a zero-size box: all it holds is placed
  await expect(page.locator('.board .qlabel')).toHaveText('Question 1 of 20');
  await expect(page.locator('.run span.done')).toHaveCount(0);
  await expect(field(page)).toBeFocused();
  await work(page);
  await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
});

test('accepted keys flash their keypad key; the arrows, which have no key, flash nothing and break nothing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await setColumns(page, 47, 38);
  const idle = () => expect(page.locator('.pad button.pressed')).toHaveCount(0);
  expect(await flashFor(page, 'Enter'), 'the ones digit empty: ignored').toEqual([]);
  expect(await flashFor(page, '5')).toEqual(['5']);
  await idle();
  expect(await flashFor(page, 'ArrowDown'), 'from the carry\'s cell: moved').toEqual([]);
  expect(await focus(page)).toBe('O');
  expect(await flashFor(page, 'ArrowUp'), 'moved').toEqual([]);
  expect(await focus(page)).toBe('C');
  expect(await flashFor(page, 'ArrowUp'), 'nowhere to go: ignored').toEqual([]);
  expect(await flashFor(page, '1')).toEqual(['1']);    // the carry: it checks the ones
  await idle();
  expect(await focus(page)).toBe('T');
  expect(await flashFor(page, 'Enter'), 'the tens digit empty: ignored').toEqual([]);
  expect(await flashFor(page, 'Backspace'), 'nothing written in the tens: ignored').toEqual([]);
  expect(await flashFor(page, '8')).toEqual(['8']);
  await idle();
  expect(await flashFor(page, 'Backspace')).toEqual(['Backspace']);
  // Every key is the game's: the arrows' own moves in the field are stopped.
  const prevented = await page.evaluate(() => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].map(key => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    document.querySelector('#ans').dispatchEvent(e);
    return e.defaultPrevented;
  }));
  expect(prevented).toEqual([true, true, true, true]);
  // The keypad's own keys work the board the same.
  await page.locator('.pad button[data-k="8"]').click();
  await expect(written(page, 'T')).toHaveText('8');
  expect(errors).toEqual([]);
});

// Writing a column's last cell checks it, as Enter would: in the ones the
// carry, in the tens the hundreds. A column with nothing to carry still
// waits for Enter.
test.describe('the carry checks the column', () => {
  test('typing the carry moves the cursor to the tens digit, with no Enter', async ({ page }) => {
    await setColumns(page, 47, 38);
    const said = await listen(page);
    await typeKeys(page, ['5', '1']);
    await expect(page.locator('#status')).toHaveText('Right. Tens column.');
    for (const id of ['O', 'C']) await expect(boardCell(page, id)).toHaveClass(/\bok\b/);
    await expect(boardCell(page, 'T')).toHaveClass(/\bfocus\b/);
    await expect(field(page)).toHaveAttribute('aria-label', 'Tens, answer');
    expect(await focus(page)).toBe('T');
    await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
    expect(await said()).toEqual(['Right. Tens column.']);
  });

  test('a wrong carry is struck through in red and costs a life; the digit stays', async ({ page }) => {
    await setColumns(page, 47, 38);
    const shook = await strikes(page);
    await typeKeys(page, ['5', '2']);
    await expect(page.locator('#status')).toHaveText('Wrong: Tens, carry. 2 lives left');
    expect(await shook()).toEqual(['C']);
    await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
    await expect(page.locator('.lives svg.lost')).toHaveCount(1);
    await expect(written(page, 'O')).toHaveText('5');
    await expect(written(page, 'C')).toHaveText('');
    await expect(boardCell(page, 'C')).toHaveClass(/\bfocus\b/);
  });

  // From now on, what the red-line draws on the board: the cells struck
  // through, each with the digit laid over it (its ghost), and the cells
  // framed in red. The function returned waits for them to clear, then says.
  const redLines = async page => {
    await page.evaluate(() => {
      window.drawnWrong = { lines: [], ghosts: [], frames: [] };
      new MutationObserver(records => {
        for (const r of records) for (const node of r.addedNodes) {
          if (!node.classList) continue;
          if (node.classList.contains('redline')) window.drawnWrong.lines.push(node.dataset.cell);
          if (node.classList.contains('redframe')) window.drawnWrong.frames.push(node.dataset.cell);
          if (node.classList.contains('ghost')) window.drawnWrong.ghosts.push([node.closest('.cell').dataset.tap, node.textContent]);
        }
      }).observe(document.querySelector('.board'), { childList: true, subtree: true });
    });
    return async () => {
      await page.waitForFunction(() => window.drawnWrong.lines.length + window.drawnWrong.frames.length
        && !document.querySelector('.board .fx, .board .redframe'));
      return page.evaluate(() => window.drawnWrong);
    };
  };

  test('a wrong carry that checks the column shows the digit typed, struck through, and no red frame', async ({ page }) => {
    await setColumns(page, 47, 38);
    const drawnWrong = await redLines(page);
    await typeKeys(page, ['5', '0']);
    expect(await drawnWrong()).toEqual({ lines: ['C'], ghosts: [['C', '0']], frames: [] });
    await expect(written(page, 'C')).toHaveText('');
    await expect(written(page, 'O')).toHaveText('5');
  });

  test('a wrong ones digit retyped with the carry kept shows the digit typed, struck through, and no red frame', async ({ page }) => {
    await setColumns(page, 47, 38);
    await typeKeys(page, ['4', '1']);                   // the ones digit wrong, the carry right
    await shaken(page);
    await expect(written(page, 'C')).toHaveText('1');
    const drawnWrong = await redLines(page);
    await typeKeys(page, ['3']);                        // the ones' last empty cell: it checks the column
    expect(await drawnWrong()).toEqual({ lines: ['O'], ghosts: [['O', '3']], frames: [] });
    await expect(page.locator('#status')).toHaveText('Wrong: Ones, answer. 1 life left');
    await expect(written(page, 'O')).toHaveText('');
    await expect(written(page, 'C')).toHaveText('1');
  });

  // The cursor hides while the answer is inked over: screen readers are
  // not told to press Enter then, on the run's last problem or any other.
  for (const last of [false, true]) {
    test(`while ${last ? 'the run\'s last answer' : 'a right answer'} is inked over, the field does not say Enter checks it`, async ({ page }) => {
      if (last) await playColumnsTo(page, 20);
      const question = last ? 20 : 1;
      await setColumns(page, 75, 38, { cells: { O: '3', C: '1', T: '1' }, done: [true, false], step: 1, focus: 'H', question });
      await expect(field(page)).toHaveAttribute('aria-label', 'Hundreds, answer: typing it checks the column');
      const labels = await page.evaluate(() => new Promise(resolve => {
        const ans = document.querySelector('#ans');
        ans.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
        const at = [ans.getAttribute('aria-label')];
        setTimeout(() => { at.push(ans.getAttribute('aria-label')); resolve(at); }, 100);
      }));
      expect(labels).toEqual(['Answer written', 'Answer written']);
    });
  }

  test('a column with nothing to carry is not checked by its digit: it still needs Enter', async ({ page }) => {
    await setColumns(page, 23, 41);                     // 64: no carry
    const said = await listen(page);
    await typeKeys(page, ['4']);
    expect(await focus(page)).toBe('C');               // on to the empty carry, unchecked
    await page.waitForTimeout(400);
    await expect(boardCell(page, 'O')).not.toHaveClass(/\bok\b/);
    expect(await page.evaluate(() => window.mathtime.game.state.step)).toBe(0);
    expect(await said()).toEqual([]);
    await typeKeys(page, ['Enter']);
    await expect(page.locator('#status')).toHaveText('Right. Tens column.');
    await expect(boardCell(page, 'T')).toHaveClass(/\bfocus\b/);
    // The tens too: 6, with no hundreds, waits for Enter.
    await typeKeys(page, ['6']);
    expect(await focus(page)).toBe('H');
    await page.waitForTimeout(400);
    await expect(page.locator('.board .qlabel')).toHaveText('Question 1 of 20');
    await typeKeys(page, ['Enter']);
    await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
  });

  test('writing the hundreds finishes the problem, with no Enter', async ({ page }) => {
    await setColumns(page, 75, 38);                     // 113
    const said = await listen(page);
    await typeKeys(page, ['3', '1', '1']);
    await expect(page.locator('#status')).toHaveText('Right. Tens column.');
    expect(await focus(page)).toBe('H');
    await typeKeys(page, ['1']);
    await expect(page.locator('.board .qlabel')).toHaveText('Question 2 of 20');
    await expect(page.locator('.run span.done')).toHaveCount(1);
    await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
    const next = await page.evaluate(() => window.mathtime.game.state.problem);
    expect(await said()).toEqual(['Right. Tens column.', 'Correct', `Question 2 of 20: ${next.a} plus ${next.b}`]);
  });
});
