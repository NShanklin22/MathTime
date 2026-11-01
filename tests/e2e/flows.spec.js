import { test, expect } from '@playwright/test';
import { open, setProblem, rect, typeKeys } from './helpers.js';

const answerText = page => page.locator('#shown').textContent();
const lostHearts = page => page.locator('.lives svg.lost').count();
// What screen readers should hear for the problem on screen, from the screen
// and the level's word for its operator.
const problemSaid = page => page.evaluate(() => {
  const text = sel => document.querySelector(sel).textContent;
  return `${text('#qnum')}: ${text('#a')} ${window.mathtime.game.level.word} ${text('#b')}`;
});

// An in-page log, timed with performance.now(), of what these tests time or
// must not miss: classes added to #eq (with the caret's visibility and the
// box border's colour at that moment), #eq's own animations, the level selector appearing, every status
// text, and every key and native edit with whether it was default-prevented.
// Install it before the action under test, once per test.
const record = page => page.evaluate(() => {
  const log = window.flowLog = [];
  const at = (type, data) => log.push({ t: performance.now(), type, ...data });
  const $ = sel => document.querySelector(sel);
  const eq = $('#eq');
  let had = new Set(eq.classList);
  new MutationObserver(() => {
    const has = new Set(eq.classList);
    for (const name of has) {
      if (!had.has(name)) at('add', { name, caret: getComputedStyle($('.caret')).visibility, border: getComputedStyle($('#slot'), '::after').borderTopColor });
    }
    had = has;
  }).observe(eq, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => {
    if (document.body.classList.contains('at-select')) at('selector', {});
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => at('status', { text: $('#status').textContent }))
    .observe($('#status'), { childList: true, characterData: true, subtree: true });
  for (const type of ['animationstart', 'animationend']) {
    eq.addEventListener(type, e => { if (e.target === eq) at(type, { name: e.animationName }); });
  }
  // On window, bubbling: these run after the answer field's own handlers.
  addEventListener('keydown', e => at('key', {
    key: e.key,
    repeat: e.repeat,
    target: e.target.id || e.target.tagName,
    shift: e.shiftKey,
    prevented: e.defaultPrevented,
    pressed: !!$(`.pad button[data-k="${CSS.escape(e.key)}"]`)?.classList.contains('pressed'),
    shown: $('#shown').textContent,
    eq: eq.className,
    selector: document.body.classList.contains('at-select'),
  }));
  addEventListener('beforeinput', e => at('beforeinput', { inputType: e.inputType, prevented: e.defaultPrevented }));
});
const flowLog = page => page.evaluate(() => window.flowLog);
const entries = async (page, match) => (await flowLog(page))
  .filter(e => Object.entries(match).every(([k, v]) => e[k] === v));
// Waits until the log has `count` entries matching `match`; returns the last.
async function seen(page, match, count = 1) {
  await expect.poll(async () => (await entries(page, match)).length).toBeGreaterThanOrEqual(count);
  return (await entries(page, match))[count - 1];
}
// From one animation's start to its end on #eq.
async function lasted(page, name) {
  const end = await seen(page, { type: 'animationend', name });
  const start = await seen(page, { type: 'animationstart', name });
  return end.t - start.t;
}
// Timers and CSS durations (spec §2) alike, in ms.
// Each measurement is recorded so drift shows in reports.
const TIME_TOL = 40;
function near(ms, target) {
  test.info().annotations.push({ type: `${target}ms`, description: `${ms.toFixed(1)}ms` });
  expect(Math.abs(ms - target), `${ms.toFixed(1)}ms, expected ${target}±${TIME_TOL}ms`).toBeLessThanOrEqual(TIME_TOL);
}

// Runs in the page: when the status first reads `text`, dispatch each key in
// `keys` on the answer field after its delay in ms (0 is at once).
const pressWhenSaid = (page, text, keys) => page.evaluate(([text, keys]) => {
  const status = document.querySelector('#status');
  const press = key => document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const watch = new MutationObserver(() => {
    if (status.textContent !== text) return;
    watch.disconnect();
    for (const [key, ms] of keys) ms ? setTimeout(() => press(key), ms) : press(key);
  });
  watch.observe(status, { childList: true, characterData: true, subtree: true });
}, [text, keys]);

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
  await record(page);
  await typeKeys(page, ['7', 'Enter']);
  const green = await seen(page, { type: 'add', name: 'correct' });
  expect(green.caret).toBe('hidden');                     // spec §4: no caret while the answer shows green
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  await expect(page.locator('#eq')).not.toHaveClass(/correct/);
  expect(await answerText(page)).toBe('');
  expect(await lostHearts(page)).toBe(0);
  // Announced at once, then the new problem once it is on screen.
  const said = await problemSaid(page);
  expect(said).toMatch(/^Question 2: \d plus \d$/);
  await seen(page, { type: 'status', text: said });
  expect((await entries(page, { type: 'status' })).map(e => e.text)).toEqual(['Correct', said]);
});

test('the next problem slides in with its box already white, not fading from green', async ({ page }) => {
  await record(page);
  await typeKeys(page, ['7', 'Enter']);
  const slideIn = await seen(page, { type: 'add', name: 'in' });
  expect(slideIn.border).toBe('rgb(238, 245, 255)');      // --ink
});

test('the answer shows green for 0.35s before sliding out', async ({ page }) => {
  await record(page);
  await typeKeys(page, ['7', 'Enter']);
  const enter = await seen(page, { type: 'key', key: 'Enter' });
  const out = await seen(page, { type: 'add', name: 'out' });
  near(out.t - enter.t, 350);
});

test('the slide-out and the slide-in each take 0.22s', async ({ page }) => {
  await record(page);
  await typeKeys(page, ['7', 'Enter']);
  near(await lasted(page, 'out'), 220);
  near(await lasted(page, 'in'), 220);
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

test('with the slide animation off, the next problem arrives at once', async ({ page }) => {
  await page.addStyleTag({ content: '.eq.out { animation: none !important; }' });
  await record(page);
  await typeKeys(page, ['7', 'Enter']);
  // Straight after the green: 'out' comes and goes within one task here,
  // so time the swap from the Enter.
  const enter = await seen(page, { type: 'key', key: 'Enter' });
  const swap = await seen(page, { type: 'add', name: 'in' });   // the next problem slides in
  near(swap.t - enter.t, 350);
  await expect(page.locator('#qnum')).toHaveText('Question 2');
});

test('a slide-out that never finishes gives way after 1s', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });   // animations frozen
  await record(page);
  await typeKeys(page, ['7', 'Enter']);
  const out = await seen(page, { type: 'add', name: 'out' });
  const swap = await seen(page, { type: 'add', name: 'in' });
  near(swap.t - out.t, 1000);
  await expect(page.locator('#qnum')).toHaveText('Question 2');
});

test('you can type as the next problem slides in', async ({ page }) => {
  await record(page);
  // Press 5 the moment the slide-in starts.
  await page.evaluate(() => {
    const eq = document.querySelector('#eq');
    const watch = new MutationObserver(() => {
      if (!eq.classList.contains('in')) return;
      watch.disconnect();
      document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true }));
    });
    watch.observe(eq, { attributes: true, attributeFilter: ['class'] });
  });
  await typeKeys(page, ['7', 'Enter']);
  const five = await seen(page, { type: 'key', key: '5' });
  expect(five.eq).toMatch(/\bin\b/);
  expect(five).toMatchObject({ shown: '5', pressed: true });
  expect(await answerText(page)).toBe('5');
});

test('digits are ignored and do not flash while a correct answer is locked in', async ({ page }) => {
  await record(page);
  // During the green (at once and 0.2s in), then during the slide-out.
  await pressWhenSaid(page, 'Correct', [['5', 0], ['6', 200]]);
  await page.evaluate(() => {
    const eq = document.querySelector('#eq');
    const watch = new MutationObserver(() => {
      if (!eq.classList.contains('out')) return;
      watch.disconnect();
      document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key: '8', bubbles: true, cancelable: true }));
    });
    watch.observe(eq, { attributes: true, attributeFilter: ['class'] });
  });
  await typeKeys(page, ['7', 'Enter']);
  for (const [key, during] of [['5', /\bcorrect\b/], ['6', /\bcorrect\b/], ['8', /\bout\b/]]) {
    const press = await seen(page, { type: 'key', key });
    expect(press.eq, `key ${key}`).toMatch(during);
    expect(press, `key ${key}`).toMatchObject({ shown: '7', pressed: false });
  }
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  expect(await answerText(page)).toBe('');
});

test('a wrong answer shakes, clears and costs one life', async ({ page }) => {
  await record(page);
  await typeKeys(page, ['9', 'Enter']);
  await seen(page, { type: 'animationstart', name: 'shake' });
  expect(await answerText(page)).toBe('');
  expect(await lostHearts(page)).toBe(1);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '2 lives left');
  await expect(page.locator('#status')).toHaveText('Wrong, 2 lives left');
  await expect(page.locator('#qnum')).toHaveText('Question 1');
});

test('the shake takes 0.32s', async ({ page }) => {
  await record(page);
  await typeKeys(page, ['9', 'Enter']);
  near(await lasted(page, 'shake'), 320);
});

test('you can type again straight away during the shake', async ({ page }) => {
  await typeKeys(page, ['9', 'Enter', '7']);
  expect(await answerText(page)).toBe('7');
});

test('with one life left, the label and the announcement say "1 life left"', async ({ page }) => {
  await record(page);
  for (let i = 0; i < 2; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '1 life left');
  await seen(page, { type: 'status', text: 'Wrong, 1 life left' });
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

test('a held Enter on the third miss does not press "Level 1"', async ({ page }) => {
  await typeKeys(page, ['7', 'Enter']);                  // to question 2, so a restart would show
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  await setProblem(page, 3, 4);
  await record(page);
  for (let i = 0; i < 2; i++) await typeKeys(page, ['9', 'Enter']);
  await typeKeys(page, ['9']);
  await page.keyboard.down('Enter');                     // the third miss, held
  await expect(page.locator('#level1')).toBeFocused();
  // The operating system's key repeat, arriving once the selector has focus.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r', autoRepeat: true,
  });
  await page.keyboard.up('Enter');
  expect(await seen(page, { type: 'key', key: 'Enter', repeat: true })).toMatchObject({ target: 'level1' });
  await expect(page.locator('#level1')).toBeVisible();
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '0 lives left');
});

test('the selector does not appear if the game restarted while it waited', async ({ page }) => {
  await record(page);
  // Restart the moment the third miss is announced, then wait out the 0.45s
  // in the page: its timer is due after the selector's.
  await page.evaluate(() => {
    const status = document.querySelector('#status');
    const watch = new MutationObserver(() => {
      if (status.textContent !== 'Out of lives') return;
      watch.disconnect();
      const { game, view } = window.mathtime;
      game.restart();
      view.render(game.state);
      setTimeout(() => { window.waitedOut = true; }, 500);
    });
    watch.observe(status, { childList: true, characterData: true, subtree: true });
  });
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await page.waitForFunction(() => window.waitedOut === true);
  expect(await entries(page, { type: 'selector' })).toEqual([]);
  await expect(page.locator('#ans')).toBeFocused();
  await expect(page.locator('.lives')).toHaveAttribute('aria-label', '3 lives left');
});

test('Level 1 draws the new game even if the layout fails', async ({ page }) => {
  await typeKeys(page, ['7', 'Enter']);
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  await setProblem(page, 3, 4);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('#level1')).toBeFocused();
  await page.evaluate(() => { window.mathtime.layout.layout = () => { throw new Error('layout failed (test)'); }; });
  await page.locator('#level1').click();
  await expect(page.locator('#qnum')).toHaveText('Question 1');
  expect(await lostHearts(page)).toBe(0);
  const { a, b } = await page.evaluate(() => window.mathtime.game.state.problem);
  await expect(page.locator('#a')).toHaveText(String(a));
  await expect(page.locator('#b')).toHaveText(String(b));
});

test('the level selector appears 0.45s after the third miss', async ({ page }) => {
  await record(page);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  const third = await seen(page, { type: 'key', key: 'Enter' }, 3);
  const selector = await seen(page, { type: 'selector' });
  near(selector.t - third.t, 450);
});

test('from the third miss until the selector, digits are ignored and do not flash', async ({ page }) => {
  await record(page);
  await pressWhenSaid(page, 'Out of lives', [['5', 0], ['6', 200]]);
  for (let i = 0; i < 3; i++) await typeKeys(page, ['9', 'Enter']);
  await expect(page.locator('#level1')).toBeVisible();
  for (const key of ['5', '6']) {
    const press = await seen(page, { type: 'key', key });
    expect(press, `key ${key}`).toMatchObject({ selector: false, shown: '', pressed: false });
  }
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

test('native edits are blocked: a typed letter changes nothing', async ({ page }) => {
  await record(page);
  await typeKeys(page, ['1', 'a']);
  expect(await seen(page, { type: 'beforeinput' })).toMatchObject({ inputType: 'insertText', prevented: true });
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

test('Meta and Alt shortcuts are left alone too', async ({ page }) => {
  await record(page);
  await page.keyboard.press('Meta+1');
  await page.keyboard.press('Alt+1');
  const ones = await entries(page, { type: 'key', key: '1' });
  expect(ones.map(e => e.prevented)).toEqual([false, false]);
  expect(await answerText(page)).toBe('');
  await expect(page.locator('#ans')).toHaveValue('');
});

test('focus that lands anywhere else comes back to the answer, so typing still works', async ({ page }) => {
  // On a keypad key (a screen reader or the browser can put it there)...
  await page.evaluate(() => document.querySelector('.pad button[data-k="3"]').focus());
  await page.keyboard.press('5');
  expect(await answerText(page)).toBe('5');
  await expect(page.locator('#ans')).toBeFocused();
  // ...or dropped to the page itself.
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('6');
  expect(await answerText(page)).toBe('56');
  await expect(page.locator('#ans')).toBeFocused();
});

test('the keypad keys are not in the tab order', async ({ page }) => {
  const keys = page.locator('.pad button');
  await expect(keys).toHaveCount(12);
  for (const key of await keys.all()) await expect(key).toHaveAttribute('tabindex', '-1');
});

test('Tab and Shift+Tab are trapped in the answer', async ({ page }) => {
  await record(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('#ans')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#ans')).toBeFocused();
  const tabs = await entries(page, { type: 'key', key: 'Tab' });
  expect(tabs.map(({ shift, prevented }) => ({ shift, prevented })))
    .toEqual([{ shift: false, prevented: true }, { shift: true, prevented: true }]);
});

test('the answer field asks for no on-screen keyboard', async ({ page }) => {
  // inputmode="none" is the only thing that keeps the phone's keyboard away.
  await expect(page.locator('#ans')).toHaveAttribute('inputmode', 'none');
});

test('the typed answer is heard once, from the answer field', async ({ page }) => {
  // The box's digits are drawn for the eye; #ans carries the same value.
  await expect(page.locator('.shown')).toHaveAttribute('aria-hidden', 'true');
});

test('the first problem is announced when the game starts', async ({ page }) => {
  await open(page);                                       // fresh: beforeEach replaced the problem
  await expect(page.locator('#status')).toHaveText(await problemSaid(page));
  expect(await problemSaid(page)).toMatch(/^Question 1: \d plus \d$/);
});

test('a quick second press of a key flashes for its full time', async ({ page }) => {
  // 5 at once and again at 60ms: at 140ms the second flash (until about
  // 170ms) must still show, though the first flash's time is up.
  const flashing = await page.evaluate(() => new Promise(resolve => {
    const press = () => document.querySelector('#ans').dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true, cancelable: true }));
    const five = document.querySelector('.pad button[data-k="5"]');
    press();
    setTimeout(press, 60);
    setTimeout(() => resolve(five.classList.contains('pressed')), 140);
  }));
  expect(flashing).toBe(true);
  await expect(page.locator('.pad button[data-k="5"]')).not.toHaveClass(/pressed/);   // and it ends
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
  await record(page);
  const before = await positions();
  await typeKeys(page, ['1']);
  expect(await positions()).toEqual(before);
  await typeKeys(page, ['8']);
  expect(await positions()).toEqual(before);
  await typeKeys(page, ['Enter']);
  await seen(page, { type: 'animationend', name: 'shake' });   // the shake has finished
  expect(await positions()).toEqual(before);
});

test('the next problem slides in even if placing it fails', async ({ page }) => {
  await record(page);
  await page.evaluate(() => { window.mathtime.layout.place = () => { throw new Error('place failed (test)'); }; });
  await typeKeys(page, ['7', 'Enter']);
  await seen(page, { type: 'add', name: 'in' });
  await expect(page.locator('#qnum')).toHaveText('Question 2');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#eq')).opacity)).toBe('1');
});
