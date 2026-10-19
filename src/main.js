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
const layout = createLayout(dom, createScanner(), LEVEL1.possibleAnswers);
const view = createView(dom, layout, LEVEL1);
layout.afterMeasure = () => view.render(game.state);

// Handle for the browser tests (tests/e2e) to put a known problem on screen.
window.mathtime = { game, view, layout };

let queued = false;
function relayout() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    layout.layout();
  });
}

fontsReady().then(() => {
  layout.layout();
  document.documentElement.classList.remove('loading');
  new ResizeObserver(relayout).observe(dom.stage);
  document.fonts.addEventListener('loadingdone', relayout);
  dom.ans.focus({ preventScroll: true });
});
