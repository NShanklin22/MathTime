import { LEVELS } from './levels.js';
import { createGame } from './game.js';
import { fontsReady } from './fonts.js';
import { createScanner } from './scanner.js';
import { createLayout } from './layout.js';
import { createView } from './view.js';
import { bindInput } from './input.js';
import { createSelector } from './selector.js';

const $ = sel => document.querySelector(sel);
const dom = {
  eq: $('#eq'), slot: $('#slot'), shown: $('#shown'), caret: $('.caret'), qnum: $('#qnum'),
  a: $('#a'), b: $('#b'), op: $('#eq .op'), ans: $('#ans'), pad: $('.pad'), stage: $('.stage'), topBar: $('.top'),
  select: $('.select'),
  topic: $('.crumbs .topic'), here: $('.crumbs .here'),
  livesBox: $('.lives'), hearts: [...document.querySelectorAll('.lives svg')], status: $('#status'),
};

const game = createGame(LEVELS[0]);
const scan = createScanner();
const layout = createLayout(dom, scan, game.level.possibleAnswers);
const view = createView(dom, layout, game.level);
layout.afterMeasure = () => view.render(game.state);
const selector = createSelector(dom.select, LEVELS, play);

// Start `level` at question 1 with full lives, focus on the answer. The
// screen is measured again: the operator and the answer box are the level's.
function play(level) {
  game.start(level);
  layout.possibleAnswers = level.possibleAnswers;
  view.setLevel(level);
  document.body.classList.remove('at-select');
  safeLayout();
  view.render(game.state);           // drawn even if the layout failed
  view.announceProblem(game.state);
  dom.ans.focus({ preventScroll: true });
}

// Back to the level selector, with the level you came from marked and
// focused (Level 2 spec §3).
function toSelector() {
  selector.mark(game.level);
  document.body.classList.add('at-select');
  safeLayout();
  selector.focus();
}

// Handle for the browser tests (tests/e2e) to put a known problem or level on screen.
window.mathtime = { game, view, layout, selector, levels: LEVELS, play };

// The game locks input itself during the correct and out-of-lives
// transitions (spec §2), so every key just goes to game.press().
bindInput(dom, key => {
  const result = game.press(key);
  if (result === 'typed') view.renderAnswer(game.state.typed);
  if (result === 'wrong') view.showWrong(game.state);
  if (result === 'correct') view.showCorrect(game.state, () => game.next());
  if (result === 'out') view.showOut(game.state).then(shown => { if (shown) toSelector(); });
  return result;
}, () => game.state.typed);

// Fonts already measured: those loaded at the first successful layout, plus
// every one loaded since. Their load events need no second measure.
const measuredFaces = new Set();
let measuredOnce = false;

// One bad measurement must never leave the page blank or stop later layouts.
function safeLayout() {
  try {
    layout.layout();
    if (!measuredOnce) {
      measuredOnce = true;
      for (const face of document.fonts) if (face.status === 'loaded') measuredFaces.add(face);
    }
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
  // The header too: on the level selector the stage is hidden, so it alone
  // would never report a resize. Fitting the header only changes which
  // crumbs show, not the header's size, so this can't loop.
  const resized = new ResizeObserver(relayout);
  resized.observe(dom.stage);
  resized.observe(dom.topBar);
  document.fonts.addEventListener('loadingdone', onFontsLoaded);
  watchPixelRatio();
});
