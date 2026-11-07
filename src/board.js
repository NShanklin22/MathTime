import { snap, onLayoutGrid } from './ink.js';
import { fitHeader } from './header.js';
import { centreKeys } from './keypad.js';
import { placeRun } from './layout.js';
import { levelName } from './levels.js';
import { TIMING, RED_MS, reducedMotion, createEffects, inkOver, redLine, redFrame, strikeGeometry, fadeOut, fadeIn, cancelOn } from './fx.js';

// The column board (Levels 6–7 batch plan): a column level's play screen,
// drawn from the game's state (game.js) by the level's method (columns.js).
// It is the approved mockup's play screen
// (docs/superpowers/specs/2026-11-05-column-methods-mockup.html), moved into
// the game: every rule, size and timing is the mockup's.
//
// Everything on the board is placed here, in px from the board's top left
// corner, which sits on a whole device pixel. Columns are a strict grid:
// every answer cell is Level 1's box for one digit (sized from the measured
// digit ink, equal padding, the border outside it), and the digits above
// are centred on their ink in the same columns.
//
// It does for a column level what the view (view.js) and the layout
// (layout.js) do for a fact level, behind the view's interface, so main.js
// plays both kinds alike: setLevel, render, announceProblem, the show*
// calls and reset, with the view's run-token rules, and layout(), which
// fits and places the board, then the header, keypad and run bar as
// layout.js does. showStep() is its own: a column checked right, the next
// one to work.

const DIGITS = [...'0123456789'];
const SMALL = 0.5;          // carry and borrow digits, against the problem's size
const MAX_FS = 128;         // Level 1's largest equation
const SVG = 'http://www.w3.org/2000/svg';

// A length in px, written exactly on the layout grid (see ink.js).
const px = v => onLayoutGrid(v, devicePixelRatio) + 'px';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const colour = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createBoard(dom, scan) {
  const { board, stage, ans, pad, topBar, run, status, livesBox, hearts, here } = dom;
  let level = null, method = null, stepOf = {}, marks = null;
  let S = null;               // the game's state, as last drawn

  // Feedback in flight belongs to the run it started in, as in the view:
  // reset() ends that run for the board, and a pending showCorrect, showOut
  // or showFinished then finds its token stale and stops. Nothing is left
  // on the board either: it holds nothing while no column level is played.
  let runToken = 0;
  const effects = createEffects();
  function reset() {
    runToken += 1;
    stop();
    board.replaceChildren();
  }
  // Whatever feedback is drawn or playing goes (fx.js).
  function stop() {
    effects.clear();
    inking.clear();
    cancelOn(board);
    board.classList.remove('out', 'in');
  }

  // The caret shows only while the answer field has the focus.
  ans.addEventListener('focus', () => document.body.classList.add('typing'));
  ans.addEventListener('blur', () => document.body.classList.remove('typing'));

  /* ---------- Measuring ---------- */
  const G = {};
  const baseCache = new Map();
  // The baseline inside a 1em, line-height 1 box, read from the live layout.
  function baseAt(size) {
    const key = `${G.family}|${size}`;
    if (!baseCache.has(key)) {
      const box = document.createElement('span');
      box.style.cssText = `position:absolute;visibility:hidden;display:block;height:1em;line-height:1;white-space:pre;font-size:${size}px`;
      box.innerHTML = '0<span style="display:inline-block;width:0;height:0;vertical-align:baseline"></span>';
      board.appendChild(box);
      baseCache.set(key, (box.lastChild.getBoundingClientRect().top - box.getBoundingClientRect().top) / size);
      box.remove();
    }
    return baseCache.get(key);
  }
  const label = () => `Question ${S.question} of ${level.problemsPerRun}`;

  // Every size on the board, from the measured digit ink at font size fs,
  // in px from the board's top left, on whole device pixels.
  function measure(fs) {
    const dpr = devicePixelRatio, d = v => snap(v, dpr);
    const cs = getComputedStyle(board);
    Object.assign(G, { dpr, fs, family: cs.fontFamily });
    G.style = { weight: cs.fontWeight, family: cs.fontFamily, color: colour('--ink') };
    G.opStyle = { ...G.style, color: colour('--muted') };
    G.labelStyle = { ...G.opStyle, spacing: 0.04 };
    const inkOf = size => {
      const each = DIGITS.map(c => scan(c, G.style, size * dpr));
      return { asc: Math.max(...each.map(m => m.asc)), desc: Math.max(...each.map(m => m.desc)), w: Math.max(...each.map(m => m.abl + m.abr)) };
    };
    const big = inkOf(fs);
    G.asc = big.asc; G.desc = big.desc;
    G.fsS = fs * SMALL;
    const small = inkOf(G.fsS);
    G.ascS = small.asc; G.descS = small.desc;

    // A big cell is Level 1's box for one digit: the widest digit's ink,
    // 0.1em padding on all four sides, the border outside it. Cells in a row
    // join into one segmented box: neighbours share a border, so the column
    // pitch is a cell's width less one border.
    G.bw = Math.max(1, Math.floor(Math.max(0.025 * fs, 2) * dpr + 1e-3)) / dpr;
    G.pad = d(0.1 * fs);
    G.W = d(big.w * fs) + 2 * (G.pad + G.bw);
    G.P = G.W - G.bw;
    // The operator, in its own column left of the number: its ink 0.5em
    // clear of the widest digit's ink in the tens column, so "+38" and
    // "−27" never read as signed numbers. Where that takes it past the
    // first column's left edge, the board grows to the left by `ox`.
    const opInk = scan(level.op, G.opStyle, fs * dpr);
    const opRight = G.P + G.W / 2 - big.w * fs / 2 - 0.5 * fs;
    G.ox = d(Math.max(0, (opInk.abl + opInk.abr) * fs - opRight));
    G.opRight = G.ox + opRight;
    G.boardW = G.ox + 2 * G.P + G.W;
    G.cx = [0, 1, 2].map(i => G.ox + i * G.P + G.W / 2);

    // A small cell: the same, from the small digits' ink, with a 1px dashed
    // frame, its width differing from a big cell's by an even number of
    // device pixels, so it centres exactly over its column.
    G.bS = 1;
    G.padS = d(0.28 * G.fsS);
    let ws = d(small.w * G.fsS) + 2 * (G.padS + G.bS);
    if (Math.round((G.W - ws) * dpr) % 2) ws += 1 / dpr;
    G.Ws = ws;
    G.ySb = d(G.bS + G.padS + G.ascS * G.fsS);
    G.Hs = d(G.ySb + G.descS * G.fsS + G.padS + G.bS);

    // Rows: the small cells, the two numbers, the rule, the answer. One ink
    // gap (0.365em) between the numbers, to the rule, and from it to the
    // answer cells; the small cells half that above the first number.
    const inkH = (G.asc + G.desc) * fs;
    G.c = d(0.365 * fs);
    G.y1 = d(G.Hs + d(0.5 * G.c) + G.asc * fs);
    G.y2 = G.y1 + d(inkH + G.c);
    G.yL = d(G.y2 + G.desc * fs + G.c);
    G.y3 = d(G.yL + G.bw + G.c + G.bw + G.pad + G.asc * fs);
    G.boxT = d(G.y3 - G.asc * fs - G.pad - G.bw);
    G.boxB = d(G.y3 + G.desc * fs + G.pad + G.bw);
    G.boardH = G.boxB;

    const caretW = (size, cellW) => {
      let w = Math.max(1, Math.round(Math.max(0.05 * size, 2) * dpr));
      if ((Math.round(cellW * dpr) - w) % 2) w += 1;
      return w / dpr;
    };
    G.cw = caretW(fs, G.W);
    G.cwS = caretW(G.fsS, G.Ws);
    G.caretT = Math.floor((G.y3 - G.asc * fs) * dpr + 1e-3) / dpr - G.boxT;
    G.caretB = Math.ceil((G.y3 + G.desc * fs) * dpr - 1e-3) / dpr - G.boxT;
    G.caretTS = Math.floor((G.ySb - G.ascS * G.fsS) * dpr + 1e-3) / dpr;
    G.caretBS = Math.ceil((G.ySb + G.descS * G.fsS) * dpr - 1e-3) / dpr;

    // "Question N of 20", as the play screen's label: its ink centred over
    // the board, a gap above the small cells.
    G.lfs = Math.max(15, 0.16 * fs);
    const lm = scan(label(), G.labelStyle, G.lfs * dpr);
    G.labelH = (lm.asc + lm.desc) * G.lfs;
    G.labelW = (lm.abl + lm.abr) * G.lfs;
    G.gapL = Math.max(0.2 * fs, 18);
  }

  // Fit the board to the problem area: as big as fits, at most Level 1's
  // largest size, between the side gutters (the label too), centred, with
  // "Question N of 20" above it and some air above and below.
  function fit() {
    const gutter = parseFloat(getComputedStyle(stage).getPropertyValue('--gutter')) || 16;
    const across = stage.clientWidth - 2 * gutter - 1;
    const half = stage.clientHeight / 2 - Math.max(12, 0.05 * stage.clientHeight);
    let fs = MAX_FS;
    for (let round = 0; round < 6; round++) {
      measure(fs);
      const s = Math.min(across / Math.max(G.boardW, G.labelW), half / (G.boardH / 2 + G.gapL + G.labelH));
      if (Math.abs(s - 1) < 1e-3 || (s >= 1 && fs >= MAX_FS)) break;
      fs = Math.max(10, Math.min(MAX_FS, fs * s));
    }
  }

  // Put a text element's ink centred on x = cx (or its right or left ink
  // edge on cx), its baseline on `base`. The ink is scanned again at the
  // sub-pixel phase it will be drawn at. Returns its ink box.
  function placeText(node, text, size, style, cx, base, align = 'centre') {
    const dpr = G.dpr;
    const start = m => align === 'right' ? cx - m.abr * size : align === 'left' ? cx + m.abl * size : cx - (m.abr - m.abl) / 2 * size;
    let m = scan(text, style, size * dpr);
    for (let i = 0; i < 3; i++) {
      const phase = Math.round((((start(m) * dpr) % 1) + 1) % 1 * 64) % 64 / 64;
      m = scan(text, style, size * dpr, phase);
    }
    const x = start(m);
    node.textContent = text;
    node.style.fontSize = size + 'px';
    node.style.left = px(x);
    node.style.top = px(base - baseAt(size) * size);
    return { l: x - m.abl * size, r: x + m.abr * size, t: base - m.asc * size, b: base + m.desc * size };
  }

  /* ---------- Drawing ---------- */
  const E = {};
  const el = (tag, cls, parent = board) => {
    const node = document.createElement(tag);
    if (cls) node.setAttribute('class', cls);
    parent.appendChild(node);
    return node;
  };

  // The board's elements for the level's method, nothing written. Built
  // afresh for every problem, so nothing of the last one fades out on it.
  function build() {
    board.replaceChildren();
    E.label = el('span', 't qlabel');
    E.a = [0, 1].map(() => el('span', 't dg'));
    E.b = [0, 1].map(() => el('span', 't dg'));
    E.op = el('span', 't op');
    E.rule = el('i', 'rule');
    E.cells = {};
    for (const c of method.cells) {
      const cell = el('div', `cell ${c.kind}${c.opt ? ' opt' : ''}`);
      cell.dataset.tap = c.id;
      el('i', 'frame', cell);
      E.cells[c.id] = { cell, v: el('span', 't v', cell), caret: el('i', 'caret', cell) };
    }
    marks?.build();
  }

  // The problem on the board, at the measured size, then its working (update).
  function place() {
    const { fs, dpr } = G;
    const sr = stage.getBoundingClientRect();
    board.style.left = px(snap(sr.left + sr.width / 2 - G.boardW / 2, dpr) - sr.left);
    board.style.top = px(snap(sr.top + sr.height / 2 - G.boardH / 2, dpr) - sr.top);
    board.style.fontSize = fs + 'px';
    board.style.setProperty('--bw', G.bw + 'px');

    const lm = scan(label(), G.labelStyle, G.lfs * dpr);
    placeText(E.label, label(), G.lfs, G.labelStyle, G.boardW / 2, snap(-G.gapL - lm.desc * G.lfs, dpr));

    const a = String(S.problem.a), b = String(S.problem.b);
    E.inkA = [...a].map((ch, i) => placeText(E.a[i], ch, fs, G.style, G.cx[i + 1], G.y1));
    E.inkB = [...b].map((ch, i) => placeText(E.b[i], ch, fs, G.style, G.cx[i + 1], G.y2));
    // The operator left of the second number, its ink centred on the digit ink.
    const om = scan(level.op, G.opStyle, fs * dpr);
    const mid = G.y2 + (G.desc - G.asc) / 2 * fs;
    placeText(E.op, level.op, fs, G.opStyle, G.opRight, snap(mid - (om.desc - om.asc) / 2 * fs, dpr), 'right');
    Object.assign(E.rule.style, { left: '0px', top: px(G.yL), width: px(G.boardW), height: px(G.bw) });

    for (const c of method.cells) {
      const { cell, caret } = E.cells[c.id];
      const big = c.kind === 'big';
      const w = big ? G.W : G.Ws, h = big ? G.boxB - G.boxT : G.Hs;
      Object.assign(cell.style, {
        left: px(G.ox + c.col * G.P + (big ? 0 : (G.W - G.Ws) / 2)),
        top: px(big ? G.boxT : 0), width: px(w), height: px(h),
      });
      const cw = big ? G.cw : G.cwS;
      Object.assign(caret.style, {
        left: px((w - cw) / 2), width: px(cw),
        top: px(big ? G.caretT : G.caretTS), height: px(big ? G.caretB - G.caretT : G.caretBS - G.caretTS),
      });
    }
    marks?.place();
    update();
  }

  // The run bar (runs spec §2): a segment filled for each problem done.
  function renderRun(state) {
    [...run.children].forEach((seg, i) => seg.classList.toggle('done', i < state.solved));
  }

  // What screen readers hear for a cell: its name, and, for a method that
  // checks a column when it is written (Level 6), that typing the column's
  // last cell (the carry, the hundreds) checks it.
  function cellLabel(c) {
    const last = method.checkWhenWritten && method.steps.some(s => s.cells.at(-1) === c.id);
    return last ? `${c.name}: typing it checks the column` : c.name;
  }

  // The state into the board: what is written, where the cursor is, what is checked.
  function update() {
    const playing = S.phase === 'playing';
    for (const c of method.cells) {
      const { cell, v } = E.cells[c.id];
      const val = S.cells[c.id];
      const big = c.kind === 'big';
      cell.classList.toggle('filled', val !== '');
      cell.classList.toggle('focus', S.focus === c.id && playing);
      cell.classList.toggle('ok', S.done[stepOf[c.id]] && !inking.has(c.id));
      if (val === '') v.textContent = '';
      else placeText(v, val, big ? G.fs : G.fsS, G.style, (big ? G.W : G.Ws) / 2, big ? G.y3 - G.boxT : G.ySb);
    }
    marks?.update();
    for (const c of method.cells) for (const anim of E.cells[c.id].caret.getAnimations()) anim.currentTime = 0;
    hearts.forEach((h, i) => h.classList.toggle('lost', i >= S.lives));
    livesBox.setAttribute('aria-label', S.lives === 1 ? '1 life left' : `${S.lives} lives left`);
    // Screen readers hear the cell the cursor is on (on Level 6, that a
    // column's last cell checks it when typed), or, with the cursor hidden,
    // that the column is written and Enter checks it; or, once the answer
    // is right and inked over, just that it is written.
    const cell = method.cells.find(c => c.id === S.focus);
    ans.setAttribute('aria-label', cell ? cellLabel(cell)
      : playing && !method.checkWhenWritten ? `${method.steps[Math.min(S.step, method.steps.length - 1)].name} column written: Enter checks it`
      : 'Answer written');
    renderRun(S);
  }

  // Level 7's marks, those of a borrow (the subtraction method's: it has
  // borrowed()): a stroke through the tens digit, a small 1 before the ones
  // digit, and a tap target over the tens digit and its cell. And the way
  // to borrow, shown on every problem (so it gives nothing away): an up
  // chevron in the empty borrow cell, as the Up key. B is the borrow cell,
  // the method's small one, and k its column.
  function borrowMarks() {
    const B = method.cells.find(c => c.kind === 'small').id, k = stepOf[B];
    return {
      build() {
        E.strike = document.createElementNS(SVG, 'svg');
        E.strike.setAttribute('class', 'strike');
        E.strike.setAttribute('aria-hidden', 'true');
        E.line = document.createElementNS(SVG, 'line');
        E.line.setAttribute('pathLength', '1');
        E.strike.appendChild(E.line);
        board.appendChild(E.strike);
        E.small1 = el('span', 't dg small1');
        E.cue = document.createElementNS(SVG, 'svg');
        E.cue.setAttribute('class', 'cue');
        E.cue.setAttribute('viewBox', '0 0 12 12');
        E.cue.setAttribute('aria-hidden', 'true');
        E.cue.innerHTML = '<path d="M3 7.5L6 4.5l3 3"/>';
        E.cells[B].cell.appendChild(E.cue);
        E.hit = el('i', 'hit');
        E.hit.dataset.tap = B;
      },
      place() {
        const { fs, dpr } = G;
        // The stroke: upper left to lower right, a little past the ink at both
        // ends (less at the top, under the borrow cell), so it crosses the
        // diagonal of a 4 or a 7 instead of running along it.
        const ink = E.inkA[0], e = 0.05 * fs, eTop = 0.05 * fs, sw = Math.max(0.045 * fs, 2);
        const x0 = ink.l - eTop, y0 = ink.t - eTop, x1 = ink.r + e, y1 = ink.b + e, m = sw;
        const left = x0 - m, top = y0 - m, w = x1 - x0 + 2 * m, h = y1 - y0 + 2 * m;
        Object.assign(E.strike.style, { left: px(left), top: px(top), width: px(w), height: px(h) });
        E.strike.setAttribute('viewBox', `0 0 ${w} ${h}`);
        E.line.setAttribute('x1', m); E.line.setAttribute('y1', m);
        E.line.setAttribute('x2', w - m); E.line.setAttribute('y2', h - m);
        E.line.setAttribute('stroke-width', sw);
        // The small 1, on the ones digit's top left corner, as on paper: its
        // baseline 0.09em above the digits' ink, its ink centred on the ones
        // digit's left ink edge. It is sized so its top stays 0.04em below the
        // borrow digit's baseline: the two never sit level, so "4" and "1"
        // don't read as 41. The same for every problem.
        const top2 = G.y1 - G.asc * fs;
        const base1 = snap(top2 - 0.09 * fs, dpr);
        const s1 = Math.min(0.4 * fs, Math.max(14, (base1 - G.ySb - 0.04 * fs) / G.asc));
        const left2 = G.cx[2] - G.W / 2 + G.bw + G.pad;   // the widest digit's ink starts here
        placeText(E.small1, '1', s1, G.style, left2, base1);
        E.cue.style.cssText = `position:absolute;left:${px((G.Ws - 0.6 * G.Ws) / 2)};top:${px((G.Hs - 0.6 * G.Ws) / 2)};width:${px(0.6 * G.Ws)};height:${px(0.6 * G.Ws)}`;
        // The tap target: the tens column, from the top of the borrow cell to
        // below the tens digit.
        Object.assign(E.hit.style, { left: px(G.ox + G.P), top: '0px', width: px(G.W), height: px(G.y1 + G.desc * fs + G.c / 2) });
      },
      update() {
        const on = method.borrowed(S.cells, S.focus);
        const playing = S.phase === 'playing';
        E.strike.classList.toggle('on', on);
        E.a[0].classList.toggle('struck', on);
        E.small1.classList.toggle('on', S.cells[B] !== '');
        E.strike.classList.toggle('ok', S.done[k]);
        E.small1.classList.toggle('ok', S.done[k]);
        E.hit.hidden = S.step !== k || !playing;
        E.cue.style.visibility = S.step === k && !on && playing ? 'visible' : 'hidden';
      },
    };
  }

  // Inked over, on the board (fx.js): the written answer, the answer row's
  // cells with a digit in them, framed as one box (they share borders), is
  // traced by the pen. Those of its cells not yet green (the column just
  // checked) stay as they were until the pen closes the frame, their digits
  // and the dividers between the cells going green as it does (the pen
  // draws only the outside); then they are green at once (.ok.inked). The
  // rest of the column (an empty cell rubbed out, a carry) turns green at
  // once, as a column checked right does.
  const inking = new Set();
  function ink(state) {
    const ids = method.cells.filter(c => c.kind === 'big' && state.cells[c.id] !== '').map(c => c.id);
    const pending = ids.filter(id => !E.cells[id].cell.classList.contains('ok'));
    pending.forEach(id => inking.add(id));
    render(state);
    if (!ids.length) return;
    const rs = ids.map(id => E.cells[id].cell.getBoundingClientRect());
    inkOver(effects, {
      parent: board,
      r: { left: Math.min(...rs.map(r => r.left)), right: Math.max(...rs.map(r => r.right)), top: rs[0].top, bottom: rs[0].bottom },
      bw: G.bw,
      digits: pending.map(id => E.cells[id].v),
      // A pending cell's sides shared with another of the answer's cells.
      borders: pending.map(id => {
        const i = ids.indexOf(id);
        const sides = [i > 0 && 'borderLeftColor', i < ids.length - 1 && 'borderRightColor'].filter(Boolean);
        return { el: E.cells[id].cell.querySelector('.frame'), sides };
      }).filter(b => b.sides.length),
      traced: () => {
        inking.clear();
        for (const id of pending) E.cells[id]?.cell.classList.add('inked');
        if (S) update();
      },
    });
  }

  // Red-line, on the board (fx.js): each wrong cell struck through, as the
  // answer box is. `was` is what each held before the check cleared
  // it (drawn()): a copy is laid over the cleared cell and struck on its
  // ink's middle, the strike's ends (halo and all) 4px at least inside the
  // frame's inner edge, as the answer box's are (a small cell's, half that).
  // A wrong cell left empty (a carry skipped, a borrow not made, Level 7's
  // tens) has nothing to strike, and a lone dash would read as a minus: its
  // frame is drawn solid warm red instead, as heavy as a big cell's, on the
  // same timing.
  // What each was is the game's (state.struck), not the cell's as drawn: a
  // digit that checked its column as it was typed (Level 6) was cleared
  // before the board drew it. The copy is placed as the cell's digit is.
  function drawn(state) {
    return state.bad.map(id => {
      const text = state.struck[id];
      const copy = E.cells[id].v.cloneNode(true);
      if (text) {
        const big = method.cells.find(c => c.id === id).kind === 'big';
        placeText(copy, text, big ? G.fs : G.fsS, G.style, (big ? G.W : G.Ws) / 2, big ? G.y3 - G.boxT : G.ySb);
      }
      return { id, text, copy };
    });
  }
  function strike(was) {
    const dpr = G.dpr, br = board.getBoundingClientRect();
    for (const { id, text, copy } of was) {
      const c = method.cells.find(cell => cell.id === id);
      const big = c.kind === 'big';
      const size = big ? G.fs : G.fsS;
      const w = big ? G.W : G.Ws;
      const frameW = big ? G.bw : G.bS;
      const { cell } = E.cells[id];
      if (!text) {
        // The big cells' weight, in a small cell too (its own 1px dashed
        // frame doesn't read), drawn inward over the cell: nothing moves.
        redFrame(effects, { cell, width: G.bw, id });
        continue;
      }
      const cx = G.ox + c.col * G.P + G.W / 2;
      const base = big ? G.y3 : G.ySb;
      const mid = base + ((big ? G.desc : G.descS) - (big ? G.asc : G.ascS)) / 2 * size;
      const m = scan(text, G.style, size * dpr);
      const inkW = (m.abl + m.abr) * size;
      const inset = frameW + (big ? 4 : 4 * SMALL);
      const ghost = copy;
      ghost.classList.replace('v', 'ghost');   // not the cell's own digit
      cell.append(ghost);
      cell.classList.add('struck');
      const s = strikeGeometry({
        left: br.left + cx - inkW / 2, right: br.left + cx + inkW / 2, mid: br.top + mid, size, ext: big ? 4 : 2,
        inside: { left: br.left + cx - w / 2 + inset, right: br.left + cx + w / 2 - inset },
      }, dpr);
      redLine(effects, { parent: board, s, ghost, cell: id, ended: () => cell.classList.remove('struck') });
    }
  }

  /* ---------- The view's interface ---------- */

  // Play `next` on the board: its place in the breadcrumb, its run bar, and
  // the board's elements for its method. Lay the screen out after this.
  function setLevel(next) {
    level = next;
    method = level.method;
    stepOf = Object.fromEntries(method.steps.flatMap((s, k) => s.cells.map(id => [id, k])));
    marks = method.borrowed ? borrowMarks() : null;
    here.textContent = levelName(level);
    run.replaceChildren(...Array.from({ length: level.problemsPerRun }, () => document.createElement('span')));
    ans.value = '';                      // the field holds no answer here: it names the cell
    build();
  }

  // The screen laid out for the problem on screen, as layout.js lays it out
  // for a fact level: the header fitted, the board fitted and placed, the
  // keypad's labels centred and the run bar on whole device pixels. The
  // header shows on the level selector too, where the board is hidden.
  function layout(state) {
    S = state;
    baseCache.clear();
    fitHeader(topBar, scan);
    if (!stage.clientWidth || !level) return;
    fit();
    place();
    centreKeys(pad, scan);
    placeRun(run);
  }

  // Draw the state: what is written, the cursor, the checks, the lives.
  // Only once the board has been measured (layout()): it places all it draws.
  function render(state) {
    S = state;
    if (G.fs) update();
  }

  // Tell screen readers which problem is now on screen.
  function announceProblem(state) {
    status.textContent = `Question ${state.question} of ${level.problemsPerRun}: ${state.problem.a} ${level.word} ${state.problem.b}`;
  }

  // A column right, and the next one to work: green, the cursor moved left.
  function showStep(state) {
    render(state);
    status.textContent = `Right. ${method.steps[state.step].name} column.`;
  }

  // The problem right, as the view's: the written answer inked over, the
  // board held 90ms and faded out (80ms), the next problem built and placed
  // while unseen, then faded in (120ms) where it sits. Input is locked
  // until the swap, 320ms; under reduced motion nothing fades.
  async function showCorrect(state, next) {
    const token = runToken;
    stop();
    status.textContent = 'Correct';
    ink(state);                          // its segment filled at once
    await wait(TIMING.hold);
    if (token !== runToken) return;      // its run is over
    board.classList.add('out');
    const out = fadeOut(board);
    await (out ? Promise.race([out.finished.catch(() => {}), wait(1000)]) : wait(TIMING.out));
    if (token !== runToken) return;
    next();
    effects.clear();
    inking.clear();
    board.classList.remove('out');
    build();
    try {
      fit();
      place();
    } catch (err) {
      console.error(err);                // still fade in, wherever it is
    }
    out?.cancel();
    announceProblem(state);
    fadeIn(effects, board);
  }

  // What a wrong check found: the method's word for it (Level 7's borrow
  // where none is needed), or the first wrong cell's name.
  function wrongWhat(state) {
    const after = method.afterWrong?.(state.step, state.bad, state.x);
    return after?.what ?? method.cells.find(c => c.id === state.bad[0]).name;
  }

  // Only the wrong cells are struck through and clear; the cursor is on the
  // first of them.
  function showWrong(state) {
    stop();
    const was = drawn(state);
    render(state);
    strike(was);
    status.textContent = `Wrong: ${wrongWhat(state)}. ${livesBox.getAttribute('aria-label')}`;
  }

  // Third miss: the red-line, then resolve true once it has cleared (0.5s;
  // 0.45s under reduced motion), when the level selector is due, unless the
  // game was restarted or its run ended meanwhile.
  async function showOut(state) {
    const token = runToken;
    stop();
    const was = drawn(state);
    render(state);
    strike(was);
    status.textContent = 'Out of lives';
    await wait(reducedMotion() ? 450 : RED_MS);
    return token === runToken && state.phase === 'out';
  }

  // The run's last problem right: inked over, its segment filled at once,
  // then resolve true when the finish screen is due (0.24s), unless its run
  // ended meanwhile. No fade: the screen gives way.
  async function showFinished(state) {
    const token = runToken;
    stop();
    status.textContent = 'Correct';
    ink(state);
    await wait(TIMING.hold);
    return token === runToken && state.phase === 'finished';
  }

  // A key (skip) jumps a red-line or a fade-in to its end at once; a new
  // layout (settle) jumps every effect to its end, so none is left where
  // the board was.
  const skip = () => effects.skip();
  const settle = () => effects.settle();

  return { setLevel, layout, render, announceProblem, showStep, showCorrect, showWrong, showOut, showFinished, reset, skip, settle };
}
