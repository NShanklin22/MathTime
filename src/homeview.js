import { levelName } from './levels.js';
import { heroParts } from './home.js';

// The home screen and the pages behind it (2026-11-17-home-screen-design.md
// §2–§4), as the home mockup (2026-11-17) draws them: Home, Progress and
// Settings. The board is dailyview.js's, Levels selector.js's.

// The keypad's check, the lock and the tiles' chevron, their viewBoxes
// cropped to their ink, stroke included.
const TICK = '<svg class="tick" viewBox="2 5 20 14.5" aria-hidden="true"><path d="M3.5 12.5l5.5 5.5l11.5-11.5"/></svg>';
const LOCK = '<svg class="lock" viewBox="-0.35 -0.35 16.7 20.7" aria-hidden="true"><path d="M4 9V5a4 4 0 0 1 8 0v4"/><rect x="1" y="9" width="14" height="10" rx="1"/><path d="M8 13v2"/></svg>';
const CHEV = '<svg class="chev" viewBox="7.75 3.75 9.5 16.5" aria-hidden="true"><path d="M9 5l7 7l-7 7"/></svg>';

// How long after a tap its double tap can still come (selector.js).
const DOUBLE_TAP_MS = 400;

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// A plain button's text: what it opens, leading, and its muted line.
function txt(title, line) {
  const box = el('span', 'b-txt');
  box.append(el('span', 'b-title', title), el('span', 'b-line', line));
  return box;
}

// ---------- Home (spec §2) ----------
// In `root` (index.html). The hero calls daily(); Next lesson, next(level);
// Levels, levels(click); the gear, settings(); the links, board() and progress().
export function createHome(root, { daily, next, levels, settings, board, progress }) {
  const $ = sel => root.querySelector(sel);
  const hero = $('.hero'), nextBtn = $('.btn.next'), levelsBtn = $('.btn.levels');
  let lesson = null;
  // A double tap on what brought Home up (Leave, the way back) must not go
  // on to press what takes its place, as on the selector (selector.js): a
  // press that starts before its double tap is over is ignored.
  let pressableAt = -Infinity, downAt = null;
  root.addEventListener('pointerdown', e => { downAt = e.timeStamp; }, true);
  root.addEventListener('mousedown', e => { if (e.timeStamp < pressableAt) e.preventDefault(); });
  function pressable(e) {
    const startedAt = e.detail && downAt != null ? downAt : e.timeStamp;
    downAt = null;
    return startedAt >= pressableAt;
  }
  const on = (node, act) => node.addEventListener('click', e => {
    e.preventDefault();
    if (pressable(e)) act(e);
  });
  on(hero, () => daily());
  on(nextBtn, () => { if (lesson) next(lesson); });
  on(levelsBtn, e => levels(e));
  on($('.gear'), () => settings());
  // The quiet links: Leaderboard, then Progress.
  const [toBoard, toProgress] = root.querySelectorAll('.links a');
  on(toBoard, () => board());
  on(toProgress, () => progress());

  // Home came up from `press`, a click if any: if it was a tap (not a key,
  // whose click has no detail), wait out its double tap.
  function cameFrom(press) {
    pressableAt = press?.detail ? press.timeStamp + DOUBLE_TAP_MS : -Infinity;
    downAt = null;
  }

  // The daily challenge: the title and the date; Start before the try. After
  // it, in Start's place, the check and "Done", the score and the place, and
  // the chevron: the hero opens the board; in a narrow window, the place
  // short (heroParts()), so "Done" keeps its room. Being played in another
  // tab, it says so there.
  const narrow = matchMedia('(max-width: 479.98px)');
  let shown = null;
  narrow.addEventListener('change', () => { if (shown) showDaily(...shown); });
  function showDaily(date, t, place) {
    shown = [date, t, place];
    const parts = heroParts(date, t, place);
    const top = [el('span', 'h-title', 'Daily challenge'), el('span', 'h-date', parts.day)];
    let cta;
    if (parts.state === 'start') cta = el('span', 'h-cta', 'Start');
    else if (parts.state === 'busy') cta = el('span', 'h-cta busy', parts.res);
    else {
      cta = el('span', 'h-cta done');
      const ok = el('span', 'ok');
      ok.innerHTML = TICK;
      ok.append('Done');
      const res = el('span', 'res', narrow.matches ? parts.short : parts.res);
      res.insertAdjacentHTML('beforeend', CHEV);
      cta.append(ok, res);
    }
    hero.replaceChildren(...top, cta);
    hero.setAttribute('aria-label', parts.label);
  }

  // While a press of the hero is being checked (main.js openDaily()): it
  // says so, dimmed, and takes no more.
  function waiting(on) {
    hero.classList.toggle('waiting', on);
    if (on) hero.setAttribute('aria-busy', 'true');
    else hero.removeAttribute('aria-busy');
  }

  // Next lesson, {level, title} (home.js nextLesson()), its lock in the
  // chevron's place if `locked`; and Levels, `finished` of `total`.
  function showLevels({ level, title }, locked, finished, total) {
    lesson = level;
    nextBtn.replaceChildren(txt(levelName(level), title));
    nextBtn.insertAdjacentHTML('beforeend', locked ? LOCK : CHEV);
    nextBtn.setAttribute('aria-label', `${title}: ${levelName(level)}${locked ? ', locked: log in to play' : ''}`);
    levelsBtn.replaceChildren(txt('Levels', `${finished} of ${total} finished`));
    levelsBtn.insertAdjacentHTML('beforeend', CHEV);
  }

  // The focus, coming back: on what you left Home by.
  function focus(which = 'hero') {
    const target = { hero, next: nextBtn, levels: levelsBtn, settings: $('.gear'), board: toBoard, progress: toProgress }[which] ?? hero;
    target.focus({ preventScroll: true });
  }

  return { showDaily, showLevels, focus, cameFrom, waiting };
}

// ---------- Progress (spec §3a) ----------
// A row per topic ({topic, done, of}, home.js topicProgress()): the name, a
// bar of a segment per built level, the finished green, "1 of 2" and a
// chevron. A row calls open(click, topic). Drawn again only when what it
// shows changes, the focus kept on its topic's row.
export function createProgress(root, { open }) {
  const rows = root.querySelector('.rows');
  let shown = null;
  function show(topics) {
    const key = JSON.stringify(topics);
    if (key === shown) return;
    shown = key;
    const had = rows.contains(document.activeElement) ? document.activeElement.dataset.topic : null;
    rows.replaceChildren(...topics.map(({ topic, done, of }) => {
      const row = el('button', 'row');
      row.type = 'button';
      row.dataset.topic = topic;
      row.setAttribute('aria-label', `${topic}: ${done} of ${of} finished. Show Levels`);
      const bar = el('span', 'bar');
      bar.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < of; i++) bar.append(el('span', i < done ? 'done' : null));
      const count = el('span', 'of', `${done} of ${of}`);
      count.setAttribute('aria-hidden', 'true');
      row.append(el('span', 'topic', topic), bar, count);
      row.insertAdjacentHTML('beforeend', CHEV);
      row.addEventListener('click', e => open(e, topic));
      return row;
    }));
    if (had) focus(had);
  }
  // The first row, or `topic`'s.
  function focus(topic = null) {
    const all = [...rows.querySelectorAll('.row')];
    (all.find(r => r.dataset.topic === topic) ?? all[0])?.focus({ preventScroll: true });
  }
  return { show, focus };
}

// ---------- Settings (spec §4) ----------
// The account: signed in, "Logged in as nate" and Log out, which calls
// logout(); signed out, Log in, filled, and Sign up, which open the log-in
// screen in that mode: open('login') or open('signup'). Drawn again only
// when who is signed in changes; the focus, if it was on a button, then
// on the first.
export function createSettings(root, { open, logout }) {
  const who = root.querySelector('.who'), buttons = root.querySelector('.buttons');
  const button = (word, cls, act) => {
    const b = el('button', cls, word);
    b.type = 'button';
    b.addEventListener('click', act);
    return b;
  };
  let shown;
  function show(name) {
    if (name === shown) return;
    shown = name;
    const had = buttons.contains(document.activeElement);
    if (name) {
      who.replaceChildren('Logged in as ', el('b', null, name));
      buttons.replaceChildren(button('Log out', 'logout', logout));
    } else {
      who.textContent = 'Not logged in';
      buttons.replaceChildren(button('Log in', 'fill login', () => open('login')), button('Sign up', 'signup', () => open('signup')));
    }
    if (had) focus();
  }
  function focus() {
    buttons.querySelector('button')?.focus({ preventScroll: true });
  }
  return { show, focus };
}
