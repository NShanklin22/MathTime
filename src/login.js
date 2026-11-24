import { snap, onLayoutGrid } from './ink.js';
import { ERRORS, NAME, checkSignup } from './account.js';

// The log-in screen (accounts spec §3), as the accounts mockup (2026-11-09)
// draws it, with open sign-up and Google (the open sign-up mockup,
// 2026-11-23). It opens from Settings (the home screen spec §4), a locked
// level, or the daily challenge's board; Pick a name, after Google.

// A text element's font as the scanner wants it, and its text.
function textOf(node) {
  const cs = getComputedStyle(node);
  const fs = parseFloat(cs.fontSize);
  return { fs, style: { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: (parseFloat(cs.letterSpacing) || 0) / fs }, text: node.textContent };
}

// ---------- The log-in screen (spec §3) ----------
// In `root` (index.html). `enter(mode, typed)` logs in or signs up and
// resolves to {name} or {error} (account.js); `done(name)` is called once in.
// `onMode(word)` hears the mode by its name, "Log in", "Sign up" or "Pick a
// name", for the breadcrumb. The modes: 'login', 'signup', and 'name',
// Pick a name, the Name field only.
export function createLogin(root, scan, { enter, done, onMode = () => {} }) {
  const $ = sel => root.querySelector(sel);
  const form = $('form'), err = $('.error'), title = $('#login-title');
  // Not in the older mockups' copies of the screen: stand-ins, never shown.
  const stand = (sel, tag) => $(sel) ?? document.createElement(tag);
  const google = stand('.google', 'a'), gErr = stand('.g-error', 'p'), or = stand('.or', 'p'), lede = stand('.lede', 'p');
  // Pick a name's line, and the one once its sign-up has expired.
  const LEDE = lede.textContent, EXPIRED = 'Start again with Google.', TIMED_OUT = 'Timed out';
  const f = { invite: $('#f-invite'), name: $('#f-name'), pass: $('#f-pass'), website: $('input[name="website"]') };
  // Optional: the older mockups (docs/superpowers/specs) run this on their
  // own copies of the screen, from before open sign-up.
  const haveCode = $('.have-code button'), noCode = $('.no-code button');
  let mode = 'login', busy = false, ready = false;
  // Sign up's Code field (the open sign-up spec §1), shut at each open().
  let codeOpen = false;
  // Each open() is a new visit: an answer to a request from an earlier one
  // is ignored.
  let visit = 0;

  function setMode(next) {
    mode = next;
    // Pick a name is Sign up's Name field, with its hint, and nothing else.
    const up = mode !== 'login', naming = mode === 'name';
    form.classList.toggle('signup', up);
    form.classList.toggle('name-mode', naming);
    root.classList.toggle('name-mode', naming);
    form.classList.remove('expired');
    lede.textContent = LEDE;
    for (const node of form.querySelectorAll('[data-for="signup"]')) node.hidden = !up;
    f.pass.autocomplete = up ? 'new-password' : 'current-password';
    f.name.setAttribute('aria-describedby', up ? 'h-name f-error' : 'f-error');
    f.pass.setAttribute('aria-describedby', up ? 'h-pass f-error' : 'f-error');
    const word = naming ? 'Pick a name' : up ? 'Sign up' : 'Log in';
    form.querySelector('.submit .line').textContent = naming ? 'Continue' : word;
    title.textContent = word;
    onMode(word);
    form.querySelector('.ask').textContent = up ? 'Have an account?' : 'New here?';
    form.querySelector('.swap').textContent = up ? 'Log in' : 'Sign up';
    f.pass.value = '';
    err.textContent = gErr.textContent = '';
  }
  form.querySelector('.swap').addEventListener('click', () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    place();
    firstEmpty()?.focus();
  });

  // The fields shown, in order: Code, opened, is under Password.
  const shown = () => mode === 'name' ? [f.name] : mode === 'signup' && codeOpen ? [f.name, f.pass, f.invite] : [f.name, f.pass];
  const firstEmpty = () => shown().find(i => !i.value);

  // Have a code?: the Code field shows, under Password, with the focus,
  // and the link goes. It stays open till the screen is left, or "No code"
  // shuts it, its value gone, the focus back on "Have a code?".
  function setCode(open) {
    codeOpen = open;
    form.classList.toggle('code-open', open);
    if (!open) f.invite.value = '';
    // Enter in the last field shown sends the form.
    f.pass.enterKeyHint = open ? 'next' : 'go';
  }
  haveCode?.addEventListener('click', () => {
    setCode(true);
    place();
    f.invite.focus();
  });
  noCode?.addEventListener('click', () => {
    setCode(false);
    place();
    haveCode.focus();
  });

  // Open it afresh, in `next` mode (Log in, or Sign up from Settings, or
  // Pick a name), the focus in its first field.
  function open(next = 'login') {
    visit++;
    busy = false;
    form.removeAttribute('aria-busy');
    setMode(next);
    setCode(false);
    f.name.value = '';
    if (f.website) f.website.value = '';
    place();
    firstEmpty()?.focus();
  }

  // Enter submits (the form's own submit). A field left empty takes the
  // focus instead, with no error: Enter in Name goes on to Password.
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const empty = firstEmpty();
    if (empty) return empty.focus();
    const typed = { invite: codeOpen ? f.invite.value : '', name: f.name.value, password: f.pass.value, website: f.website?.value ?? '' };
    let error = mode === 'signup' ? checkSignup(typed) : mode === 'name' && !NAME.test(typed.name.trim()) ? 'name' : null;
    if (!error) {
      const mine = visit;
      busy = true;
      form.setAttribute('aria-busy', 'true');
      const result = await enter(mode, typed);
      if (mine !== visit) return;
      busy = false;
      form.removeAttribute('aria-busy');
      if (result.stale) return;
      error = result.error ?? null;
      if (!error) {
        f.pass.value = '';
        return done(result.name);
      }
    }
    showError(error);
  });

  // The error goes as soon as any field is edited, and Google's too.
  form.addEventListener('input', () => {
    if (!err.textContent && !gErr.textContent) return;
    err.textContent = gErr.textContent = '';
    place();
  });

  // Google's way (the open sign-up spec §2), once /api/config has said it
  // is on: "or", then the button.
  function offerGoogle(on) {
    google.hidden = or.hidden = !on;
    place();
  }

  // Back from Google with it failed: its error under its button, and
  // nothing focused, so no ring shows on the screen.
  function googleFailed() {
    gErr.textContent = ERRORS.google;
    document.activeElement?.blur();
    place();
  }

  // The error under the button; what was typed stays, but the password
  // (unless it was the server not answering, or the name that was wrong),
  // and the focus goes to the field to fix, or the button to try again.
  function showError(code) {
    if (code === 'invite' && !codeOpen) setCode(true);    // a code is wanted after all
    // Pick a name's sign-up gone: Continue with Google is all that's left.
    // The screen is named for what happened, in its title and the
    // breadcrumb (onMode), as a mode is; the line under the title says
    // why, so no red error repeats it.
    if (code === 'expired') {
      form.classList.add('expired');
      title.textContent = TIMED_OUT;
      onMode(TIMED_OUT);
      lede.textContent = EXPIRED;
      err.textContent = gErr.textContent = '';
      place();
      return google.focus();
    }
    err.textContent = ERRORS[code];
    const fix = { mismatch: f.pass, invite: f.invite, taken: f.name, name: f.name, password: f.pass }[code];
    if (!['offline', 'rate', 'name'].includes(code)) f.pass.value = '';
    place();
    if (fix) fix.focus();
    else form.querySelector('.submit').focus();
  }

  // ---------- On its ink ----------
  // Labels, hints, the errors, "Have a code?", Pick a name's line and the
  // other link start their ink at the field's edge (or end it there, the
  // hints, "No code" among them); the button's word is centred on its ink.
  function inkLeft(node) {
    const dpr = devicePixelRatio;
    node.style.marginLeft = '';
    const { fs, style, text } = textOf(node);
    const left = node.getBoundingClientRect().left;
    const at = snap(left + scan(text.split('\n')[0], style, fs * dpr).abl * fs, dpr);
    node.style.marginLeft = onLayoutGrid(at - left, dpr) + 'px';
  }
  function inkRight(node) {
    const dpr = devicePixelRatio;
    node.style.marginRight = '';
    const { fs, style, text } = textOf(node);
    const r = node.getBoundingClientRect();
    const m = scan(text, style, fs * dpr);
    // Its last letter's edge, drawn smooth, runs about a pixel past the
    // scanned ink: a pixel in, so what shows ends on the field's edge.
    const at = snap(r.right - 1 - m.abr * fs, dpr);
    node.style.marginRight = onLayoutGrid(r.left - at, dpr) + 'px';
  }
  function centreInk(line) {
    const dpr = devicePixelRatio;
    line.style.removeProperty('--ink-dx');
    const { fs, style, text } = textOf(line);
    const m = scan(text, style, fs * dpr);
    const box = line.getBoundingClientRect(), outer = line.parentElement.getBoundingClientRect();
    const inkMid = box.left + (m.abr - m.abl) * fs / 2;
    const want = outer.left + outer.width / 2;
    line.style.setProperty('--ink-dx', onLayoutGrid(snap(box.left + want - inkMid, dpr) - box.left, dpr) + 'px');
  }
  function place() {
    if (!ready || !root.getClientRects().length) return;
    const visible = n => n.getClientRects().length > 0;
    for (const node of root.querySelectorAll('label, .error, .switch, .have-code, .g-error, .lede')) if (visible(node)) inkLeft(node);
    for (const node of form.querySelectorAll('.hint')) if (visible(node)) inkRight(node);
    centreInk(form.querySelector('.submit .line'));
  }

  // Esc and the way back go back without logging in (main.js).
  // Opened before the page was ready (Pick a name, from ?auth=), the focus
  // goes in once it is, unless Google's error is shown.
  return {
    open, place, offerGoogle, googleFailed,
    start() {
      ready = true;
      place();
      if (root.getClientRects().length && document.activeElement === document.body && !gErr.textContent) firstEmpty()?.focus();
    },
  };
}
