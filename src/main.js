import { LEVELS } from './levels.js';
import { createGame } from './game.js';
import { fontsReady } from './fonts.js';
import { createScanner } from './scanner.js';
import { createLayout } from './layout.js';
import { createView } from './view.js';
import { bindInput } from './input.js';
import { createSelector } from './selector.js';
import { buildRecord } from './record.js';
import { createQueue } from './queue.js';
import { createFinish, finishText } from './finish.js';

const $ = sel => document.querySelector(sel);
const dom = {
  eq: $('#eq'), slot: $('#slot'), shown: $('#shown'), caret: $('.caret'), qnum: $('#qnum'),
  a: $('#a'), b: $('#b'), op: $('#eq .op'), ans: $('#ans'), pad: $('.pad'), stage: $('.stage'), topBar: $('.top'),
  run: $('.run'), select: $('.select'), finish: $('.finish'),
  topic: $('.crumbs .topic'), here: $('.crumbs .here'), back: $('.crumbs .back'),
  livesBox: $('.lives'), hearts: [...document.querySelectorAll('.lives svg')], status: $('#status'),
};

const game = createGame(LEVELS[0]);
const scan = createScanner();
const layout = createLayout(dom, scan, game.level.possibleAnswers);
const view = createView(dom, layout, game.level);
layout.afterMeasure = () => view.render(game.state);
const selector = createSelector(dom.select, LEVELS, play, scan);
const queue = createQueue();
// Each finished level's best, from the runs kept (finished-mark spec §2).
selector.showBests(queue.best);
const finish = createFinish(dom.finish, scan, { again: () => play(game.level), levels: toSelector });

// Start a run of `level` at question 1 with full lives, focus on the answer.
// Feedback still playing out for the run before stops first (view.reset()):
// its next() would otherwise move this run on. The screen is measured
// again: the operator and the answer box are the level's.
function play(level) {
  view.reset();
  game.start(level);
  layout.possibleAnswers = level.possibleAnswers;
  view.setLevel(level);
  document.body.classList.remove('at-select', 'at-finish');
  safeLayout();
  view.render(game.state);           // drawn even if the layout failed
  view.announceProblem(game.state);
  dom.ans.focus({ preventScroll: true });
}

// Back to the level selector, with the level you came from marked and
// focused (Level 2 spec §3). The run is left behind (§4). The game takes no
// keys until a level starts, and anything still playing out for the run
// stops. What it last said is cleared, so the next problem is announced
// even if it reads the same. `press` is the click on a "Levels", if that
// is how you came.
function toSelector(press) {
  game.leave();
  view.reset();
  dom.status.textContent = '';
  selector.mark(game.level);
  selector.showBests(queue.best);    // with the run just finished, if any
  selector.cameFrom(press);
  document.body.classList.remove('at-finish');
  document.body.classList.add('at-select');
  safeLayout();
  selector.focus();
}

// The run is finished: its record goes into the queue at once (runs spec
// §6), and the finish screen's words are settled against the best of the
// runs kept before it. The time is in whole ms, as the record has it.
// Keeping it must never stop the finish screen: a record that can't be made
// (no crypto.randomUUID() on an origin that isn't secure) is not kept, and
// the screen still shows the time.
function keepRun() {
  const { level, totalMs, misses } = game.result;
  let best = null;
  try {
    best = queue.best(level);
    queue.add(buildRecord(game.result));
  } catch (err) {
    console.error(err);
  }
  return finishText(level, Math.round(totalMs), misses, best);
}

// The finish screen, with "Again" focused (runs spec §3).
function toFinish(text) {
  finish.show(text);
  document.body.classList.add('at-finish');
  safeLayout();
  finish.focus();
  dom.status.textContent = text.said;
}

// The way back (Level 2 spec §4): the "Levels" link, or Esc (not while an
// input method is composing), from the play screen or the finish screen.
// Keys otherwise go to the answer, so the link is never focused. A tap on
// the link waits out its double tap, as one on the finish screen's
// "Levels" does.
dom.back.addEventListener('click', e => {
  e.preventDefault();
  toSelector(e);
});
addEventListener('keydown', e => {
  // keyCode 229: Safari can send the keydown that ends a composition with
  // isComposing false.
  if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || document.body.classList.contains('at-select')) return;
  e.preventDefault();
  toSelector();
});

// Handle for the browser tests (tests/e2e) to put a known problem, level or
// finish screen on screen.
window.mathtime = { game, view, layout, selector, finish, levels: LEVELS, play };

// The game locks input itself during the correct, out-of-lives and finished
// transitions (spec §2), so every key just goes to game.press().
bindInput(dom, key => {
  const result = game.press(key);
  if (result === 'typed') view.renderAnswer(game.state.typed);
  if (result === 'wrong') view.showWrong(game.state);
  if (result === 'correct') view.showCorrect(game.state, () => game.next());
  if (result === 'out') view.showOut(game.state).then(shown => { if (shown) toSelector(); });
  if (result === 'finished') {
    const text = keepRun();
    view.showFinished(game.state).then(shown => { if (shown) toFinish(text); });
  }
  return result;
}, () => game.state.typed);

// Fonts already measured: those loaded at the first successful layout, plus
// every one loaded since. Their load events need no second measure.
const measuredFaces = new Set();
let measuredOnce = false;

// One bad measurement must never leave the page blank or stop later layouts.
// The selector is laid out apart, so a failure in one leaves the other.
function safeLayout() {
  try {
    layout.layout();
    if (document.body.classList.contains('at-finish')) finish.place();
    if (!measuredOnce) {
      measuredOnce = true;
      for (const face of document.fonts) if (face.status === 'loaded') measuredFaces.add(face);
    }
  } catch (err) {
    console.error(err);
  }
  try {
    selector.layout();
  } catch (err) {
    console.error(err);
  }
}

let queued = false;
function relayout() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    safeLayout();
  });
}

// Measure from scratch when the ink changes without a resize: a font that
// arrives after fontsReady() gave up, or a new device pixel ratio (moving to
// another screen), which ResizeObserver does not report.
function remeasure() {
  scan.reset();
  relayout();
}
function onFontsLoaded(e) {
  const fresh = e.fontfaces.filter(face => !measuredFaces.has(face));
  fresh.forEach(face => measuredFaces.add(face));
  if (fresh.length) remeasure();
}
function watchPixelRatio() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => {
    watchPixelRatio();               // re-arm for the new ratio
    remeasure();
  }, { once: true });
}

fontsReady().then(() => {
  safeLayout();
  document.documentElement.classList.remove('loading');
  // The header too: on the level selector and the finish screen the stage
  // is hidden, so it alone would never report a resize. Fitting the header
  // only changes which crumbs show, not the header's size, so this can't
  // loop. The finish screen's column too, as in the mockup: centring its
  // lines never changes its size either. And the selector's list, whose
  // rows narrow when a scrollbar comes into it: lining them up on their ink
  // never changes its size.
  const resized = new ResizeObserver(relayout);
  resized.observe(dom.stage);
  resized.observe(dom.topBar);
  resized.observe(dom.finish);
  resized.observe(dom.select);
  document.fonts.addEventListener('loadingdone', onFontsLoaded);
  watchPixelRatio();
});
