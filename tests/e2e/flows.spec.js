import { test, expect } from '@playwright/test';
import { open, setProblem, rect, typeKeys } from './helpers.js';

const answerText = page => page.locator('#shown').textContent();
const lostHearts = page => page.locator('.lives svg.lost').count();
// What screen readers should hear for the problem on screen, from the screen.
const problemSaid = page => page.evaluate(() => {
  const text = sel => document.querySelector(sel).textContent;
  return `${text('#qnum')}: ${text('#a')} plus ${text('#b')}`;
});

test.beforeEach(async ({ page }) => {
  await open(page);
  await setProblem(page, 3, 4);
});

test('typing shows the answer in the box; a third digit is ignored', async ({ page }) => {
  await typeKeys(page, ['1', '8', '5']);
  expect(await answerText(page)).toBe('18');
  await expect(page.locator('#ans')).toHaveValue('18');   // screen readers hear it
  await expect(page.locator('#slot')).toHaveClass(/full/);
});

test('a correct answer turns green, then the next question slides in', async ({ page }) => {
  await typeKeys(page, ['7', 'Enter']);
  await expect(page.locator('#eq')).toHaveClass(/correct/);
  await expect(page.locator('.caret')).toBeHidden();      // spec §4: no caret while the answer shows green
  await expect(page.locator('#status')).toHaveText('Question 1 correct');
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  await expect(page.locator('#eq')).not.toHaveClass(/correct/);
  expect(await answerText(page)).toBe('');
  expect(await lostHearts(page)).toBe(0);
  expect(await problemSaid(page)).toMatch(/^Question 2: \d plus \d$/);
  await expect(page.locator('#status')).toHaveText(await problemSaid(page));   // then the new problem
});

test('the next problem waits for the slide-out to finish', async ({ page }) => {
  // An animation's first frame comes a frame or two after it is asked for, so
  // a timer of its nominal length can end before it does, but only sometimes.
  // Slowing animations a little (0.22s becomes about 0.26s) makes that gap
  // certain: the swap must follow the animation itself, not a timer.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.85 });
  // Record the slide-out's state at the moment the next problem is swapped in.
  await page.evaluate(() => {
    const { game } = window.mathtime;
    const eq = document.querySelector('#eq');
    const next = game.next;
    game.next = () => {
      const out = eq.getAnimations().find(a => a.animationName === 'out');
      window.atSwap = { slide: out?.playState, opacity: getComputedStyle(eq).opacity };
      next();
    };
  });
  await typeKeys(page, ['7', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  expect(await page.evaluate(() => window.atSwap)).toEqual({ slide: 'finished', opacity: '0' });
});

test('with the slide animation off, the next problem still arrives', async ({ page }) => {
  await page.addStyleTag({ content: '.eq.out { animation: none !important; }' });
  await typeKeys(page, ['7', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2');
});

test('a wrong answer shakes, clears and costs one life', async ({ page }) => {
  await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('#eq')).toHaveClass(/shake/);
  expect(await answerText(page)).toBe('');
  expect(await lostHearts(page)).toBe(1);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  await expect(page.locator('#status')).toHaveText('Wrong, 2 lives left');
  await expect(page.locator('#qnum')).toHaveText('Question 1');
});

test('you can type again straight away during the shake', async ({ page }) => {
  await typeKeys(page, ['9', 'Enter', '7']);
  expect(await answerText(page)).toBe('7');
});

test('three misses go to the level selector; Level 1 restarts at question 1', async ({ page }) => {
  await typeKeys(page, ['7', 'Enter']);                  // to question 2
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  await setProblem(page, 3, 4);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '0 lives left');
  await expect(page.locator('#level1')).toBeVisible();
  await expect(page.locator('#level1')).toBeFocused();
  // An amber focus ring, not a second white border.
  await expect(page.locator('#level1')).toHaveCSS('outline-color', 'rgb(255, 214, 107)');
  await expect(page.locator('#level1')).toHaveCSS('outline-offset', '4px');
  await page.locator('#level1').click();
  await expect(page.locator('#qnum')).toHaveText('Question 1');
  expect(await lostHearts(page)).toBe(0);
  await expect(page.locator('#ans')).toBeFocused();
  await expect(page.locator('#status')).toHaveText(await problemSaid(page));
});

test('an IME composition cannot make the answer field disagree with the box', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await typeKeys(page, ['1']);
  await cdp.send('Input.imeSetComposition', { text: '3', selectionStart: 1, selectionEnd: 1 });
  await expect(page.locator('#ans')).toHaveValue('1');
  await cdp.send('Input.insertText', { text: '3' });      // commit the composition
  expect(await answerText(page)).toBe('1');
  await expect(page.locator('#ans')).toHaveValue('1');
});

test('the on-screen keypad works the same as the keyboard', async ({ page }) => {
  await page.locator('.pad button[data-k="7"]').click();
  expect(await answerText(page)).toBe('7');
  await page.locator('.pad button[data-k="Backspace"]').click();
  expect(await answerText(page)).toBe('');
  await page.locator('.pad button[data-k="7"]').click();
  await page.locator('.pad button[data-k="Enter"]').click();
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  await expect(page.locator('#ans')).toBeFocused();       // taps never steal focus
});

test('browser shortcuts are left alone', async ({ page }) => {
  const prevented = await page.evaluate(() => {
    const e = new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true, cancelable: true });
    document.querySelector('#ans').dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(false);
  expect(await answerText(page)).toBe('');
});

test('accepted physical keys flash their key; ignored ones do not', async ({ page }) => {
  // Each probe starts once the key's previous flash (110ms) has ended, so it
  // sees only the flash from its own key press.
  const flash = async key => {
    await expect(page.locator(`.pad button[data-k="${key}"]`)).not.toHaveClass(/pressed/);
    return page.evaluate(k => {
      document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      return document.querySelector(`.pad button[data-k="${k}"]`).classList.contains('pressed');
    }, key);
  };
  expect(await flash('Enter')).toBe(false);     // empty box: ignored
  expect(await flash('5')).toBe(true);
  expect(await flash('5')).toBe(true);
  expect(await flash('5')).toBe(false);         // third digit: ignored
});

test('nothing in the equation moves while typing or after a wrong answer', async ({ page }) => {
  const positions = async () => Promise.all(['#a', '#b', '#slot', '#qnum'].map(s => rect(page, s))
    .concat([rect(page, '.op', 0), rect(page, '.op', 1)]));
  const before = await positions();
  await typeKeys(page, ['1']);
  expect(await positions()).toEqual(before);
  await typeKeys(page, ['8']);
  expect(await positions()).toEqual(before);
  await typeKeys(page, ['Enter']);
  await page.waitForTimeout(400);                         // let the shake finish
  expect(await positions()).toEqual(before);
});
