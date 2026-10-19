import { LEVEL1 } from './level1.js';
import { createGame } from './game.js';
import { fontsReady } from './fonts.js';
import { createScanner } from './scanner.js';
import { createLayout } from './layout.js';
import { createView } from './view.js';

const $ = sel => document.querySelector(sel);
const dom = {
  eq: $('#eq'), slot: $('#slot'), shown: $('#shown'), caret: $('.caret'), qnum: $('#qnum'),
  a: $('#a'), b: $('#b'), ans: $('#ans'), pad: $('.pad'), stage: $('.stage'), topBar: $('.top'),
  livesBox: $('.lives'), hearts: [...document.querySelectorAll('.lives svg')], status: $('#status'),
};

const game = createGame(LEVEL1);
const scan = createScanner();
const layout = createLayout(dom, scan, LEVEL1.possibleAnswers);
const view = createView(dom, layout, LEVEL1);
layout.afterMeasure = () => view.render(game.state);

// Handle for the browser tests (tests/e2e) to put a known problem on screen.
window.mathtime = { game, view, layout };

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
  new ResizeObserver(relayout).observe(dom.stage);
  document.fonts.addEventListener('loadingdone', onFontsLoaded);
  watchPixelRatio();
  dom.ans.focus({ preventScroll: true });
});
