import { LEVELS } from './levels.js';
import { createGame } from './game.js';
import { fontsReady } from './fonts.js';
import { createScanner } from './scanner.js';
import { createLayout } from './layout.js';
import { createView } from './view.js';
import { createBoard } from './board.js';
import { bindInput } from './input.js';
import { createSelector } from './selector.js';
import { buildRecord } from './record.js';
import { createQueue } from './queue.js';
import { createFinish, finishText } from './finish.js';
import { createAccount } from './account.js';
import { createLogin } from './login.js';
import { dateKey, dailyLevel, dailyProblems, dailyRecord, boardFrom, placeOn, tryScore, untilMidnight, createDailyStore, QUESTIONS, TRY, BOARDS, IN_PROGRESS } from './daily.js';
import { createDailyBoard, BUSY, OFFLINE } from './dailyview.js';
import { nextLesson, topicProgress, boardButton } from './home.js';
import { createHome, createProgress, createSettings } from './homeview.js';
import { formatTime } from './finish.js';

const $ = sel => document.querySelector(sel);
const dom = {
  eq: $('#eq'), slot: $('#slot'), shown: $('#shown'), caret: $('.caret'), qnum: $('#qnum'),
  a: $('#a'), b: $('#b'), op: $('#eq .op'), ans: $('#ans'), pad: $('.pad'), stage: $('.stage'), topBar: $('.top'),
  run: $('.run'), select: $('.select'), finish: $('.finish'), board: $('#board'), check: $('.pad .go'),
  here: $('.crumbs .here'), back: $('.crumbs .back'), login: $('.login'),
  livesBox: $('.lives'), hearts: [...document.querySelectorAll('.lives svg')], status: $('#status'),
  dboard: $('.dboard'), home: $('div.home'), progress: $('div.progress'), settings: $('div.settings'),
};
const body = document.body;

// ---------- The screens (2026-11-17-home-screen-design.md §1) ----------
// Each screen is a class on the body: Home, Levels (the selector), the
// finish screen, log in, the daily challenge's board, Progress and
// Settings; none, the play screen. One at a time.
const SCREENS = ['at-home', 'at-select', 'at-finish', 'at-login', 'at-daily', 'at-progress', 'at-settings'];
// `visits` counts the changes: what waits (openDaily()) can tell the
// screen it began on has gone.
let visits = 0;
function screenTo(cls = null) {
  visits++;
  body.classList.remove(...SCREENS);
  if (cls) body.classList.add(cls);
}
const on = cls => body.classList.contains(cls);
// The breadcrumb: the way back, `back` (its word and its name), and where
// you are, `here`: "Home › Levels", "Levels › Subtraction 3".
function crumbs(back, here = null) {
  dom.back.querySelector('.word').textContent = back;
  dom.back.setAttribute('aria-label', back);
  if (here != null) dom.here.textContent = here;
}

// Does the system's own scrollbar take room (a desktop's classic bar, with
// a mouse or only a touch screen), or lie over the page (a phone's)? Where
// it takes room, the lists that can scroll get the theme's scrollbar
// (styles.css, html.scrollbars-take-room); where it lies over the page, the
// system's is left alone, taking none. Measured once, at the start, on a
// plain box outside the lists, before anything is laid out.
function markScrollbars() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:100px;height:100px;overflow:scroll;visibility:hidden';
  document.body.append(probe);
  const room = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  document.documentElement.classList.toggle('scrollbars-take-room', room > 0);
}
markScrollbars();

const game = createGame(LEVELS[0]);
const scan = createScanner();
const layout = createLayout(dom, scan, game.level.possibleAnswers);
const view = createView(dom, layout, game.level);
layout.afterMeasure = () => view.render(game.state);
// A column level (Levels 6–7) is played on the column board, which stands
// in for the view and the layout behind the view's interface.
const board = createBoard(dom, scan);
let screen = view;                   // the one for the level being played
const selector = createSelector(dom.select, LEVELS, choose, scan);
const queue = createQueue();
// Who is signed in, and the upload of finished runs (accounts spec §5).
const account = createAccount({ queue });
const finish = createFinish(dom.finish, scan, { again: () => play(game.level), levels: toSelector });
// Its breadcrumb is "Settings › Log in" (where you came from), or
// "› Sign up" in that mode; Pick a name's, "Home › Pick a name".
const login = createLogin(dom.login, scan, { enter: account.enter, done: loggedIn, onMode: word => { dom.here.textContent = word; } });
// Continue with Google, if the server offers it (the open sign-up spec §2).
account.config().then(({ google }) => login.offerGoogle(google));
// The daily challenge (daily spec): the day's try and board as this
// browser keeps them, and the board.
const days = createDailyStore();
// Its Start goes the way Home's does (openDaily()).
const dboard = createDailyBoard(dom.dboard, {
  practice: () => playDaily(true), start: () => openDaily(), levels: e => toSelector(e, { board: boardDate }),
  login: () => openLogin({ board: boardDate }),
});
// Home and the pages behind it (the home screen spec §2–§4).
const home = createHome(dom.home, {
  daily: () => openDaily(), next: chooseFromHome, levels: e => toSelector(e, { home: true }), settings: showSettings,
  board: () => showBoard(dateKey()), progress: showProgress,
});
const progress = createProgress(dom.progress, { open: (e, topic) => toSelector(e, { progress: topic }) });
const settings = createSettings(dom.settings, { open: mode => openLogin({ settings: true }, mode), logout });

// ---------- The account (accounts spec §2–§5) ----------

// Signed out, a level that isn't free is locked (spec §2).
const locked = level => !account.name && !level.free;

// The selector, Home, Progress and Settings as the account stands: the
// locks, the name, and each finished level's best (finished-mark spec §2),
// the account's signed in, this browser's runs signed out.
let shownName;
function showAccount() {
  selector.showBests(account.bests());
  selector.showLocks(locked);
  showLessons();
  settings.show(account.name);
  showTile();
  // Your place on the board is the account's: asked again when it changes.
  if (shownName !== undefined && shownName !== account.name) refreshDaily();
  shownName = account.name;
  // Laid out only once the fonts are in: ink measured in a fallback font
  // would be kept (the scanner caches it).
  if (fontsIn && on('at-select')) {
    try {
      selector.layout();
    } catch (err) {
      console.error(err);
    }
  }
}

// ---------- Home (the home screen spec §2) ----------

// The level played last (its n), kept for Next lesson's "Last played".
const LAST = 'mathtime.lastPlayed';
function lastPlayed() {
  try {
    return Number(localStorage.getItem(LAST)) || null;
  } catch {
    return null;
  }
}
function keepLastPlayed(level) {
  try {
    localStorage.setItem(LAST, String(level.n));
  } catch {}
}

// Next lesson, Levels' count, and Progress, from the bests as they stand.
function showLessons() {
  const best = account.bests();
  const finished = n => best(n) != null;
  const lesson = nextLesson(LEVELS, finished, lastPlayed());
  home.showLevels(lesson, locked(lesson.level), LEVELS.filter(l => finished(l.n)).length, LEVELS.length);
  progress.show(topicProgress(LEVELS, finished));
}

// Next lesson: locked, it opens log in, and once in, the level starts.
// Levels, after it, is under Home.
function chooseFromHome(level) {
  levelsFrom = { home: true };
  if (locked(level)) return openLogin({ level, home: true });
  play(level);
}

// Home, the focus on what you left it by (homeview.js focus()). Whatever
// was being played is left first, as on the way to Levels. `press` is the
// click that brought it up, if any.
function toHome(which = 'hero', press = null) {
  leavePlay();
  levelsFrom = { home: true };
  dom.status.textContent = '';
  home.cameFrom(press);
  screenTo('at-home');
  showLessons();
  showTile();
  safeLayout();
  home.focus(which);
  cutOffGone();
}

// A try another tab was playing, if that tab has gone (its lock is free),
// is cut off there (endCutOff()): Home and the board, which said "Finish it
// in the other tab", then say how it ended.
// While that tab plays on, the lock is waited for: when it goes (the tab
// finished, or closed), the try is cut off if it never ended, and both say
// so. One wait a day.
const waitingFor = new Set();
function cutOffGone() {
  const date = on('at-daily') ? boardDate : dateKey();
  const t = days.get(date);
  if (!t?.started || t.ended || !navigator.locks || lockHeld?.date === date || waitingFor.has(date)) return;
  waitingFor.add(date);
  navigator.locks.request(lockName(date), () => {
    waitingFor.delete(date);
    cutOff(date);
    showTile();
    redrawBoard();
  }).catch(err => console.error(err)).finally(() => waitingFor.delete(date));
}

// Progress and Settings, "Home › Progress", "Home › Settings"; the focus
// on Progress's first row, or the row of `topic` (back from Levels).
function showProgress(topic = null) {
  leavePlay();
  showLessons();
  screenTo('at-progress');
  crumbs('Home', 'Progress');
  safeLayout();
  progress.focus(topic);
}
function showSettings() {
  settings.show(account.name);
  screenTo('at-settings');
  crumbs('Home', 'Settings');
  safeLayout();
  settings.focus();
}
// The cached state at once, so the locks never flash; then the API's.
let fontsIn = false;
let boardDate = null;                // the day of the board shown, or last shown
let daily = null;                    // {date, practice, id} while it is played
let shownDay = null;                 // the day Home shows
let lockHeld = null;                 // the scored try's lock, while this tab plays it: {date, release, dropped}
let asked = 0;                       // boards asked for: an answer to an earlier ask is ignored
// A try cut off by a reload or a closed tab ends out now; one another tab
// still plays is waited for (cutOffGone()).
endCutOff().then(() => cutOffGone()).catch(err => console.error(err));
showAccount();
account.onChange(showAccount);
// Back from Google (the open sign-up spec §2, step 5): ?auth= says how it
// went, and is taken off the URL at once. `in`: signed in, as /api/me
// will say, on Home; `name`: Pick a name; `failed`: Log in, with the error.
const auth = new URLSearchParams(location.search).get('auth');
if (auth) history.replaceState(null, '', location.pathname + location.hash);
if (auth === 'in') account.forgetLogout();
account.check().catch(err => console.error(err)).then(name => {
  if (auth === 'in' && name && on('at-home')) dom.status.textContent = `Signed in as ${name}`;
  refreshDaily();
});

// A row of the selector: a locked one opens log in, and once in, the level
// starts (spec §3).
function choose(level) {
  if (locked(level)) return openLogin({ level });
  play(level);
}

// The log-in screen (`origin`): from Settings ({settings}, in `mode`, Log
// in or Sign up), a locked level ({level}, on Levels or, {home}, Home's
// Next lesson), or the board's "Log in" ({board}). Its way back names
// where you came from: "Settings › Log in".
let origin = null;
function openLogin(from = {}, mode = 'login') {
  origin = from;
  screenTo('at-login');
  crumbs(from.settings ? 'Settings' : from.board ? 'Daily challenge' : from.home ? 'Home' : 'Levels');
  dom.status.textContent = '';
  login.open(mode);                  // "Log in" in the breadcrumb
  safeLayout();
}

// Back where you came from without logging in (Esc, the way back): the
// selector, the focus on the row you tapped; Home, on Next lesson;
// Settings; or the daily challenge's board, if you came from its "Log in".
function leaveLogin() {
  if (origin?.board) return showBoard(origin.board);
  if (origin?.settings) return showSettings();
  if (origin?.home) return toHome('next');
  toSelector();
  if (origin?.level) {
    selector.mark(origin.level);
    selector.focus();
  }
}

// In: the level tapped starts, or the board you came from, or, from
// Settings, Home (the home screen spec §4).
function loggedIn(name) {
  if (!on('at-login')) return;
  if (origin?.board) {
    showBoard(origin.board);
    dom.status.textContent = `Signed in as ${name}`;
    return;
  }
  if (origin?.level) {
    play(origin.level);
    return;
  }
  toHome();
  dom.status.textContent = `Signed in as ${name}`;
}

// Settings' "Log out": the runs stay, the upload stops.
function logout() {
  account.logout().catch(err => console.error(err));
  showAccount();
  settings.focus();
  dom.status.textContent = 'Logged out';
}

// Start a run of `level` at question 1 with full lives, focus on the answer.
// Feedback still playing out for the run before stops first (reset()): its
// next() would otherwise move this run on. The screen is measured again:
// the operator and the answer box are the level's, or the board its method's.
function play(level) {
  if (!level.daily) {
    daily = null;
    keepLastPlayed(level);
  }
  practising(false);
  view.reset();
  board.reset();
  game.start(level);
  screen = showScreenFor(level);
  if (screen === view) layout.possibleAnswers = level.possibleAnswers;
  layout.fitFor = level.daily ? fitWidest(level) : null;
  screen.setLevel(level);
  // A level's way back is Levels; the daily challenge's, Home.
  crumbs(level.daily ? 'Home' : 'Levels');
  screenTo();
  safeLayout();
  // The equation is drawn even if the layout failed; the board, which
  // places everything it draws, only once it has been measured.
  screen.render(game.state);
  screen.announceProblem(game.state);
  dom.ans.focus({ preventScroll: true });
}

// The play screen for `level`: the equation for a fact level, the column
// board for a column level (body[data-kind] shows the one). One answer
// field serves both, so it is moved: into the equation's box, or beside the
// board, where it is never in the way of a tap, and screen readers hear the
// cell it is on (the board names it). Moved only when it must be: a move
// takes the focus away. The check key says what it checks.
function showScreenFor(level) {
  const column = level.kind === 'column';
  document.body.dataset.kind = column ? 'column' : 'fact';
  const home = column ? dom.stage : dom.slot;
  if (dom.ans.parentElement !== home) home.append(dom.ans);
  if (!column) dom.ans.setAttribute('aria-label', 'Answer');
  dom.check.setAttribute('aria-label', column ? 'Check the column' : 'Check answer');
  return column ? board : view;
}

// Back to the level selector, with the level you came from marked and
// focused (Level 2 spec §3). The run is left behind (§4). The game takes no
// keys until a level starts, and anything still playing out for the run
// stops. What it last said is cleared, so the next problem is announced
// even if it reads the same. `press` is the click on a "Levels", if that
// is how you came.
// From anywhere but a level (Home, Progress, the board: `from`, {home},
// {progress: topic} or {board: date}), no row is marked, and the focus is
// on the first row. Its way back goes back there: "Home › Levels",
// "Progress › Levels", "Daily challenge › Levels". From a level, or log in,
// it goes where it went before.
let levelsFrom = { home: true };     // Home ({home}), Progress ({progress: topic}) or the board ({board: date})
function toSelector(press, from = null) {
  const fromLevel = !SCREENS.some(on) || on('at-finish');
  const level = game.level;
  if (from) levelsFrom = from;
  leavePlay();
  dom.status.textContent = '';
  selector.mark(fromLevel && !level.daily ? level : null);
  selector.showBests(account.bests());   // with the run just finished, if any
  selector.cameFrom(press);
  screenTo('at-select');
  crumbs(levelsFrom.progress ? 'Progress' : levelsFrom.board ? 'Daily challenge' : 'Home', 'Levels');
  safeLayout();
  if (fromLevel && !level.daily) selector.focus();
  else selector.focusFirst();
}

// Levels' way back: where you came to it from, the focus on what took you.
function leaveLevels(press) {
  if (levelsFrom.progress) return showProgress(levelsFrom.progress);
  if (levelsFrom.board) {
    showBoard(levelsFrom.board);
    return dboard.focus('levels');
  }
  toHome('levels', press);
}

// Leave whatever is being played: a scored try left partway is out at
// that question (daily spec §2). The game takes no keys until a level
// starts, and anything still playing out for the run stops.
function leavePlay() {
  if (daily && !daily.practice) endDaily(true, 'left');
  daily = null;
  practising(false);
  closePrompt();
  game.leave();
  view.reset();
  board.reset();
}

// ---------- The daily challenge (2026-11-14-daily-challenge-design.md) ----------

// The board's place as the account signed in now has it (the board kept
// last, if it fetched it): signed out you aren't on it.
function keptBoard(date) {
  return days.board(date, account.name);
}

// Home's daily challenge as the day stands: before today's try, after it
// with your place on the board kept last; started and not ended, in
// progress in another tab.
function showTile() {
  const date = dateKey();
  shownDay = date;
  home.showDaily(date, days.get(date), account.name ? placeOn(keptBoard(date)) : null);
}

// The board, if shown, again, from what it showed last (boardToShow()'s
// answer, its note with it), or the board kept since, if another tab
// fetched one: its button as the try now stands (another tab's, or a new
// day). It keeps its place.
let boardShown = null;
function redrawBoard() {
  if (!on('at-daily')) return;
  const kept = keptBoard(boardDate);
  const fetched = boardShown?.board || boardShown?.loading ? (kept ? { board: kept } : null) : null;
  showBoardNow(boardDate, fetched ? boardToShow(boardDate, fetched) : boardShown ?? { board: null, loading: true });
}

// The day changes at local midnight: Home with it, and the board's button
// (yesterday's board has no Start), whether the page is looked at then (a
// timer) or later (coming back to it).
function dayChanged() {
  if (dateKey() === shownDay) return;
  showTile();
  redrawBoard();
  refreshDaily(on('at-daily') ? boardDate : dateKey());
}
function atMidnight() {
  setTimeout(() => {
    dayChanged();
    atMidnight();
  }, untilMidnight() + 50);
}
atMidnight();
addEventListener('focus', dayChanged);
document.addEventListener('visibilitychange', () => { if (!document.hidden) dayChanged(); });

// Home's daily challenge: before today's try, the challenge starts; after
// it, the board. A try started and not ended is another tab's: it says so,
// and nothing starts. Unless that tab has gone (its lock is free): then it
// is cut off there, and the board shows.
// The board's Start goes the same way. While it waits (the lock, the
// board), the control pressed says so and takes no more presses; if the
// screen changes meanwhile, nothing starts.
let opening = false;
async function openDaily() {
  if (opening) return;
  opening = true;
  const visit = visits;
  home.waiting(true);
  dboard.waiting(true);
  try {
    const date = dateKey();
    let t = days.get(date);
    if (t?.started && !t.ended && navigator.locks) {
      await endCutOff(date);
      t = days.get(date);
    }
    // Signed in, the try may have been played on another device: the board
    // says so (reconcile()). Asked first, for a moment at most; offline, this
    // browser's state stands.
    if (!t?.started && account.name) {
      await Promise.race([refreshDaily(date), new Promise(resolve => setTimeout(resolve, CHECK_MS))]);
      t = days.get(date);
    }
    if (visits !== visit) return;
    if (t?.ended) showBoard(date);
    else if (t?.started) {
      showTile();
      redrawBoard();
      dom.status.textContent = IN_PROGRESS;
    } else playDaily(false);
  } finally {
    opening = false;
    home.waiting(false);
    dboard.waiting(false);
  }
}

const CHECK_MS = 1500;                // how long a try waits for the board, signed in

// Play the day's 20: the one scored try, or Practice, the board's day
// again, unscored, only once that day's try has ended (so it never shows
// the problems of a try still being played, in another tab). The try is
// kept as started, as the account signed in, before its first problem
// shows, so a reload partway counts as out (endCutOff); and this tab holds
// its lock while it plays it.
function playDaily(practice) {
  const date = practice ? boardDate ?? dateKey() : dateKey();
  const t = days.get(date);
  let id = null;
  if (practice) {
    if (!t?.ended) return;
  } else {
    if (t?.started) return t.ended ? showBoard(date) : showTile();
    // Kept as started only once this tab holds the try's lock; if another
    // tab took it first, that tab plays it.
    return holdLock(date, () => {
      if (days.get(date)?.started) return false;
      id = newId();
      days.set(date, { id, started: true, ended: false, out: false, reached: 1, totalMs: null, problems: [], current: null, shownAt: Date.now(), name: account.name });
      startDaily(date, false, id);
      return true;
    }, () => {
      showTile();
      dom.status.textContent = IN_PROGRESS;
    });
  }
  startDaily(date, true, null);
}
function startDaily(date, practice, id) {
  play(dailyLevel(date, LEVELS));
  daily = { date, practice, id };
  practising(practice);
  safeLayout();
  saveProgress();
}

// The Web Lock a tab holds while it plays a scored try (navigator.locks;
// where there is none, any load cuts off an unended try, as a reload).
function lockName(date) {
  return `mathtime-daily-${date}`;
}
// `granted()` starts the try once the lock is this tab's (true if it
// did); `taken()` if another tab holds it.
function holdLock(date, granted, taken) {
  dropLock();
  if (!navigator.locks) return void granted();
  const held = { date, release: null, dropped: false };
  lockHeld = held;
  navigator.locks.request(lockName(date), { ifAvailable: true }, lock => {
    if (!lock || held.dropped || !granted()) {
      if (lockHeld === held) lockHeld = null;
      if (!lock) taken();
      return null;
    }
    return new Promise(resolve => { held.release = resolve; });
  }).catch(err => console.error(err));
}
function dropLock() {
  if (!lockHeld) return;
  lockHeld.dropped = true;
  lockHeld.release?.();
  lockHeld = null;
}

// Another tab changed the day's try: Home, and the board if shown, as
// it now stands. If it ended this tab's try (it found it cut off), this
// tab stops, and shows the board. A board another tab fetched gives Home
// its place.
addEventListener('storage', e => {
  if (e.key === BOARDS) {
    showTile();
    return redrawBoard();
  }
  if (e.key !== null && e.key !== TRY) return;
  if (daily && !daily.practice) {
    const t = days.get(daily.date);
    if (t?.id === daily.id && !t.ended) return;
    const { date } = daily;
    dropLock();
    showBoard(date);
    dom.status.textContent = 'Your try ended in another tab';
    return;
  }
  showTile();
  redrawBoard();
  cutOffGone();
  refreshDaily(on('at-daily') ? boardDate : dateKey());
});

// The answer box fits the widest of the day's answers (dailyLevel); the
// font fits the widest of its problems, drawn while the equation is
// measured, so neither changes between them.
function fitWidest(level) {
  const digits = f => String(f.a).length + String(f.b).length;
  const widest = level.facts.reduce((w, f) => (digits(f) > digits(w) ? f : w));
  return () => view.render({ ...game.state, problem: { ...widest }, typed: '' });
}

// A record's id; where crypto.randomUUID() isn't (an origin that isn't
// secure), one as random as the page can make it.
function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

// How far a scored try has got, kept as it goes: the question on screen,
// the problems answered and the one on screen, and who is signed in.
function saveProgress() {
  if (!daily || daily.practice) return;
  const t = days.get(daily.date);
  if (!t || t.ended || t.id !== daily.id) return;
  const { problems, current } = game.sofar();
  days.set(daily.date, { ...t, reached: game.state.question, problems, current: { a: current.a, b: current.b, misses: current.misses }, shownAt: Date.now() - current.ms, name: account.name });
}

// The scored try has ended: finished, or out at the question on screen,
// `how`: its third miss ('lives'), or left partway ('left').
function endDaily(out, how = 'left') {
  const { date, id } = daily;
  const t = days.get(date);
  if (!t || t.ended || t.id !== id) return;
  if (out) {
    const { problems, current } = game.sofar();
    // Between problems, the one on screen is answered already.
    const all = game.state.phase === 'correct' ? problems : [...problems, current];
    finishTry(date, t, { out: true, reached: game.state.question, problems: all, how });
  } else {
    const { totalMs, problems } = game.result;
    finishTry(date, t, { out: false, reached: QUESTIONS, totalMs, problems });
  }
}

// Keep the try as ended, owned by `owner`: whoever is signed in now, for a
// try that ends here; the one it was played as, for one cut off. It goes in
// that account's outbox, and up at once if it is the one signed in; ended
// signed out, it is never sent (daily spec §5). Then the board is asked
// for again.
function finishTry(date, t, { out, reached, totalMs = null, problems, how = null }, owner = account.name) {
  days.set(date, { ...t, ended: true, out, how: out ? how ?? 'left' : null, reached, totalMs: out ? null : Math.round(totalMs), problems: [], current: null, name: owner ?? null });
  if (lockHeld?.date === date) dropLock();
  let sent = Promise.resolve();
  try {
    if (owner) sent = account.keepDaily(date, dailyRecord({ id: t.id, finishedAt: new Date(), out, reached, totalMs, problems }), owner);
  } catch (err) {
    console.error(err);
  }
  sent.catch(err => console.error(err)).then(() => refreshDaily(date));
}

// A try started and never ended (of `only` that day, or any): a reload or
// a closed tab partway, which counts as out where it was. Not one a tab
// still plays: that tab holds its lock. Where there are no locks, any.
async function endCutOff(only = null) {
  for (const { date } of days.unended()) {
    if (only && date !== only) continue;
    if (lockHeld?.date === date) continue;
    if (!navigator.locks) {
      cutOff(date);
      continue;
    }
    try {
      await navigator.locks.request(lockName(date), { ifAvailable: true }, lock => { if (lock) cutOff(date); });
    } catch (err) {
      console.error(err);
    }
  }
}
function cutOff(date) {
  const t = days.get(date);
  if (!t?.started || t.ended) return;
  const problems = [...(t.problems ?? [])];
  if (t.current) problems.push({ ...t.current, ms: Math.max(0, Date.now() - (t.shownAt ?? Date.now())) });
  if (!problems.length) {
    const p = dailyProblems(date, LEVELS)[0];
    problems.push({ a: p.a, b: p.b, ms: 0, misses: 0 });
  }
  finishTry(date, t, { out: true, reached: t.reached ?? 1, problems }, t.name ?? null);
}

// The board for `date`, from the API (GET /api/daily/:date): {board}, kept
// for offline use as the account that asked; {busy} if the API is
// (429); null if it can't be had.
async function fetchBoard(date) {
  const who = account.name;
  try {
    const res = await fetch(`/api/daily/${date}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (res.status === 429) return { busy: true };
    if (res.status !== 200) return null;
    const board = boardFrom(await res.json());
    if (!board || account.name !== who) return null;
    days.keepBoard(date, board, who);
    if (who) reconcile(date, board);
    return { board };
  } catch {
    return null;
  }
}

// Signed in, the server's score is the day's (the UI review): your row on
// the board (`you`) is the try, played on another device, or the first of
// two (the API keeps it, and answered this one 409). It takes the place of
// this browser's, never of a try still being played here.
function reconcile(date, board) {
  const you = board.rows.find(r => r.you);
  if (!you) return;
  const t = days.get(date);
  if (t?.started && !t.ended) return;
  const out = you.totalMs === null;
  if (t?.ended && t.out === out && (out ? t.reached === you.reached : t.totalMs === you.totalMs)) return;
  const how = t?.ended && t.out && out && t.reached === you.reached ? t.how : null;
  days.set(date, { ...(t ?? {}), id: t?.id ?? null, started: true, ended: true, out, how, reached: you.reached, totalMs: you.totalMs,
    problems: [], current: null, name: account.name });
}

// What the board shows for `date`, fetched or not: the API's board; else
// the board kept last, if signed out or it has you on it; else none, and
// a note: the API is busy, or the board will show when you're back online.
function boardToShow(date, fetched) {
  if (fetched?.board) return { board: fetched.board };
  const kept = keptBoard(date);
  if (kept && (!account.name || kept.rows.some(r => r.you))) return { board: kept };
  return { board: null, note: fetched?.busy ? BUSY : OFFLINE };
}

// Ask for the board again, for Home's place, and the board if shown.
async function refreshDaily(date = dateKey()) {
  if (!account.name && !days.get(date)?.ended && boardDate !== date) return;
  const mine = ++asked;
  const fetched = await fetchBoard(date);
  if (mine !== asked) return;
  showTile();
  if (on('at-daily') && boardDate === date) showBoardNow(date, boardToShow(date, fetched));
}

// The board (daily spec §4), in place of the finish screen after a try,
// and from Home: the board kept last at once, then the API's.
let practiced = null;                // the practice told on the board, if it was just played
let fresh = false;                   // the try told on the board, as it just ended here
function showBoard(date, practice = null, ended = false) {
  boardDate = date;
  practiced = practice;
  fresh = ended;
  daily = null;
  practising(false);
  closePrompt();
  game.leave();
  view.reset();
  board.reset();
  screenTo('at-daily');
  crumbs('Home', 'Daily challenge');
  // Opened afresh: at 1st place (dailyview.js), not where it was left.
  dboard.open();
  const kept = keptBoard(date);
  showBoardNow(date, kept ? { board: kept } : { board: null, loading: true }, false);
  safeLayout();
  dboard.focus();
  refreshDaily(date);
  cutOffGone();
}
// The board as it stands: `shown`, {board, note} (boardToShow()); your
// place on it, signed in, for the result line.
// A check of Home's (openDaily()) still running shows on Start too.
function showBoardNow(date, shown, place = true) {
  boardShown = shown;
  const where = account.name ? placeOn(shown.board) : null;
  const t = days.get(date);
  dboard.show({ date, t, name: account.name, practice: practiced, fresh, place: where, button: boardButton(date, dateKey(), t), waiting: opening, ...shown });
  if (place) dboard.place();
}

// Practice in the breadcrumb, "Home › Daily challenge › Practice"
// (header.js fits it, "‹ Daily › Practice" at the narrowest), or not.
function practising(on) {
  document.body.classList.toggle('practice', on);
  if (on) Object.assign(dom.here.dataset, { full: 'Daily challenge', short: 'Daily' });
  else {
    delete dom.here.dataset.full;
    delete dom.here.dataset.short;
  }
}


// The run is finished: its record goes into the queue at once (runs spec
// §6), and the finish screen's words are settled against the best of the
// runs kept before it. The time is in whole ms, as the record has it.
// Runs are kept and found by the level's build order (the result's level,
// its n); the screen names it as the breadcrumb does.
// Keeping it must never stop the finish screen: a record that can't be made
// (no crypto.randomUUID() on an origin that isn't secure) is not kept, and
// the screen still shows the time.
function keepRun() {
  const { level, totalMs, misses } = game.result;
  let best = null;
  try {
    best = account.best(level);
    // Kept, and signed in, sent to the account (accounts spec §5).
    account.keep(buildRecord(game.result)).catch(err => console.error(err));
  } catch (err) {
    console.error(err);
  }
  return finishText(game.level, Math.round(totalMs), misses, best);
}

// The finish screen, with "Again" focused (runs spec §3).
function toFinish(text) {
  finish.show(text);
  body.classList.add('at-finish');
  safeLayout();
  finish.focus();
  dom.status.textContent = text.said;
}

// The way back (Level 2 spec §4): the "Levels" link, or Esc (not while an
// input method is composing), from the play screen or the finish screen.
// Keys otherwise go to the answer, so the link is never focused. A tap on
// the link waits out its double tap, as one on the finish screen's
// "Levels" does.
// In a scored daily try, the way back asks first (the UI review): leaving
// counts as out. Esc then closes the question, as Stay does.
// Each goes up one (the home screen spec §1): a level to Levels; Levels,
// the daily challenge, its board, Progress and Settings to Home, the focus
// on what you left Home by; log in to where you came from. Home has none.
function goBack(press) {
  if (on('at-login')) leaveLogin();
  else if (leaving) stay();
  else if (askToLeave()) return;
  else if (on('at-select')) leaveLevels(press);
  else if (on('at-progress')) toHome('progress', press);
  else if (on('at-settings')) toHome('settings', press);
  else if (on('at-daily') || game.level.daily) toHome('hero', press);
  else toSelector(press);
}
dom.back.addEventListener('click', e => {
  e.preventDefault();
  goBack(e);
});
addEventListener('keydown', e => {
  // keyCode 229: Safari can send the keydown that ends a composition with
  // isComposing false.
  if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || on('at-home')) return;
  e.preventDefault();
  goBack();
});

// ---------- Leaving a scored daily try (the UI review) ----------
// "Leave? This counts as Out at N", Stay (focused: Enter stays) and Leave.
// While it is asked, the try takes no keys or taps, but its clock runs on.
// Leave ends it out, as leaving did; Stay, or Esc, plays on. Closing or
// reloading the tab asks nothing: the try is out (endCutOff).
const leavePrompt = $('.leave');
let leaving = false;
function askToLeave() {
  if (!daily || daily.practice || !['playing', 'correct'].includes(game.state.phase)) return false;
  leaving = true;
  document.body.classList.add('leaving');
  leaveText();
  leavePrompt.hidden = false;
  leavePrompt.querySelector('.stay').focus();
  return true;
}
// "This counts as Out at N.", N the question on screen: a right answer's
// next problem may come up behind the question, and it is told then.
function leaveText() {
  leavePrompt.querySelector('#leave-text').textContent = `This counts as Out at ${game.state.question}.`;
}
function closePrompt() {
  leaving = false;
  document.body.classList.remove('leaving');
  leavePrompt.hidden = true;
}
function stay() {
  closePrompt();
  dom.ans.focus({ preventScroll: true });
}
leavePrompt.querySelector('.stay').addEventListener('click', stay);
leavePrompt.querySelector('.go-leave').addEventListener('click', e => {
  closePrompt();
  toHome('hero', e);
});
// The focus stays in the question: Tab goes between its two buttons.
leavePrompt.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const [a, b] = leavePrompt.querySelectorAll('button');
  (document.activeElement === a ? b : a).focus();
});

// Handle for the browser tests (tests/e2e) to put a known problem, level or
// finish screen on screen, or lay the screen out again as a resize does (relayout).
window.mathtime = { game, view, layout, board, selector, finish, levels: LEVELS, play, relayout, account, login, openLogin, days, dboard, showBoard, playDaily, toHome };

// The game locks input itself during the correct, out-of-lives and finished
// transitions (spec §2), so every key just goes to game.press(). On the
// board, a key that writes, moves the cursor or checks a column right just
// redraws it ('typed', 'moved', 'step'); the rest is feedback, as on a
// fact level.
// While the game is playing, any key first jumps a red-line or a fade-in
// still playing to its end (fx.js): an effect never delays a key. In any
// other phase (out of lives, locked in) a key leaves the effect alone.
bindInput(dom, key => {
  if (leaving) return 'ignored';                // asked whether to leave: paused
  if (game.state.phase === 'playing') screen.skip();
  const result = game.press(key);
  if (result === 'typed') {
    if (screen === board) board.render(game.state);
    else view.renderAnswer(game.state.typed);
  }
  if (result === 'moved') board.render(game.state);
  if (result === 'step') board.showStep(game.state);
  if (result === 'wrong') screen.showWrong(game.state);
  if (result === 'wrong') saveProgress();
  if (result === 'correct') screen.showCorrect(game.state, () => {
    game.next();
    saveProgress();
    if (leaving) leaveText();
  });
  // The daily challenge ends on its board, a scored try kept at once, out
  // or finished. Practice is kept nowhere: you hear its time.
  // A practice's result shows over the board in place of the try's.
  const playing = daily;
  if (result === 'out') {
    if (playing && !playing.practice) endDaily(true, 'lives');
    const reached = game.state.question;
    screen.showOut(game.state).then(shown => {
      if (!shown) return;
      if (!playing) return toSelector();
      showBoard(playing.date, playing.practice ? { out: true, reached } : null, !playing.practice);
      if (playing.practice) dom.status.textContent = `Practice: out at ${reached} of ${QUESTIONS}`;
    });
  }
  if (result === 'finished' && playing) {
    if (!playing.practice) endDaily(false);
    const totalMs = Math.round(game.result.totalMs);
    screen.showFinished(game.state).then(shown => {
      if (!shown) return;
      showBoard(playing.date, playing.practice ? { out: false, totalMs } : null, !playing.practice);
      dom.status.textContent = playing.practice ? `Practice: ${formatTime(totalMs)}` : `Daily challenge: ${tryScore(days.get(playing.date))}`;
    });
  } else if (result === 'finished') {
    const text = keepRun();
    screen.showFinished(game.state).then(shown => { if (shown) toFinish(text); });
  }
  return result;
}, () => game.state.typed);

// A tap on a cell of the board, or on Level 7's tens digit (which borrows),
// moves the cursor there if it is in the column being worked (game.tap).
// The focus stays in the answer field all the same (input.js).
dom.board.addEventListener('pointerdown', e => {
  const target = e.target.closest('[data-tap]');
  if (target && game.tap(target.dataset.tap) === 'moved') board.render(game.state);
});

// Fonts already measured: those loaded at the first successful layout, plus
// every one loaded since. Their load events need no second measure.
const measuredFaces = new Set();
let measuredOnce = false;

// One bad measurement must never leave the page blank or stop later layouts.
// The selector is laid out apart, so a failure in one leaves the other.
function safeLayout() {
  try {
    if (screen === board) board.layout(game.state);
    else layout.layout();
    if (on('at-finish')) finish.place();
    if (!measuredOnce) {
      measuredOnce = true;
      for (const face of document.fonts) if (face.status === 'loaded') measuredFaces.add(face);
    }
  } catch (err) {
    console.error(err);
  }
  try {
    selector.layout();
    login.place();
    if (on('at-daily')) dboard.place();
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
    screen.settle();                 // no effect is left drawn where the screen was
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

// Pick a name, or Log in with Google's error, opened here, once all the
// screen's parts are set up (?auth=, above).
if (auth === 'name') openLogin({ home: true }, 'name');
if (auth === 'failed') {
  openLogin({ home: true });
  login.googleFailed();
}

fontsReady().then(() => {
  fontsIn = true;
  login.start();
  safeLayout();
  document.documentElement.classList.remove('loading');
  // The header too: on the level selector and the finish screen the stage
  // is hidden, so it alone would never report a resize. Fitting the header
  // only changes which crumbs show, not the header's size, so this can't
  // loop. The finish screen's column too, as in the mockup: centring its
  // lines never changes its size either. And the selector's list, whose
  // rows narrow when a scrollbar comes into it: lining them up on their ink
  // never changes its size. Putting its groups in columns, or letting its
  // padding give way, can change its size, but what it chooses depends only
  // on the room the page gives it, which neither changes, so the next
  // layout chooses the same and it settles (selector.spec.js counts them).
  const resized = new ResizeObserver(relayout);
  resized.observe(dom.stage);
  resized.observe(dom.topBar);
  resized.observe(dom.finish);
  resized.observe(dom.select);
  resized.observe(dom.login);
  resized.observe(dom.dboard);
  document.fonts.addEventListener('loadingdone', onFontsLoaded);
  watchPixelRatio();
});
