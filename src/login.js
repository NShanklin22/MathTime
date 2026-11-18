import { snap, onLayoutGrid } from './ink.js';
import { ERRORS, checkSignup } from './account.js';

// The log-in screen (accounts spec §3), as the accounts mockup (2026-11-09)
// draws it. It opens from Settings (the home screen spec §4), a locked
// level, or the daily challenge's board.

// A text element's font as the scanner wants it, and its text.
function textOf(node) {
  const cs = getComputedStyle(node);
  const fs = parseFloat(cs.fontSize);
  return { fs, style: { weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: (parseFloat(cs.letterSpacing) || 0) / fs }, text: node.textContent };
}

// ---------- The log-in screen (spec §3) ----------
// In `root` (index.html). `enter(mode, typed)` logs in or signs up and
// resolves to {name} or {error} (account.js); `done(name)` is called once in.
// `onMode(word)` hears the mode by its name, "Log in" or "Sign up", for the
// breadcrumb.
export function createLogin(root, scan, { enter, done, onMode = () => {} }) {
  const $ = sel => root.querySelector(sel);
  const form = $('form'), err = $('.error'), title = $('#login-title');
  const f = { invite: $('#f-invite'), name: $('#f-name'), pass: $('#f-pass') };
  let mode = 'login', busy = false, ready = false;
  // Each open() is a new visit: an answer to a request from an earlier one
  // is ignored.
  let visit = 0;

  function setMode(next) {
    mode = next;
    const up = mode === 'signup';
    form.classList.toggle('signup', up);
    for (const node of form.querySelectorAll('[data-for="signup"]')) node.hidden = !up;
    f.pass.autocomplete = up ? 'new-password' : 'current-password';
    f.name.setAttribute('aria-describedby', up ? 'h-name f-error' : 'f-error');
    f.pass.setAttribute('aria-describedby', up ? 'h-pass f-error' : 'f-error');
    const word = up ? 'Sign up' : 'Log in';
    form.querySelector('.submit .line').textContent = word;
    title.textContent = word;
    onMode(word);
    form.querySelector('.ask').textContent = up ? 'Have an account?' : 'Have an invite?';
    form.querySelector('.swap').textContent = up ? 'Log in' : 'Sign up';
    f.pass.value = '';
    err.textContent = '';
  }
  form.querySelector('.swap').addEventListener('click', () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    place();
    firstEmpty()?.focus();
  });

  const shown = () => [f.invite, f.name, f.pass].filter(i => !i.closest('.field').hidden);
  const firstEmpty = () => shown().find(i => !i.value);

  // Open it afresh, in `next` mode (Log in, or Sign up from Settings), the
  // focus in its first field.
  function open(next = 'login') {
    visit++;
    busy = false;
    form.removeAttribute('aria-busy');
    setMode(next);
    f.invite.value = f.name.value = '';
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
    const typed = { invite: f.invite.value, name: f.name.value, password: f.pass.value };
    let error = mode === 'signup' ? checkSignup(typed) : null;
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

  // The error goes as soon as any field is edited.
  form.addEventListener('input', () => {
    if (!err.textContent) return;
    err.textContent = '';
    place();
  });

  // The error under the button; what was typed stays, but the password
  // (unless it was the server not answering, or the name that was wrong),
  // and the focus goes to the field to fix, or the button to try again.
  function showError(code) {
    err.textContent = ERRORS[code];
    const fix = { mismatch: f.pass, invite: f.invite, taken: f.name, name: f.name, password: f.pass }[code];
    if (!['offline', 'rate', 'name'].includes(code)) f.pass.value = '';
    place();
    if (fix) fix.focus();
    else form.querySelector('.submit').focus();
  }

  // ---------- On its ink ----------
  // Labels, hints, the error and the other link start their ink at the
  // field's edge (or end it there, the hints); the button's word is
  // centred on its ink.
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
    for (const node of form.querySelectorAll('label, .error, .switch')) if (visible(node)) inkLeft(node);
    for (const node of form.querySelectorAll('.hint')) if (visible(node)) inkRight(node);
    centreInk(form.querySelector('.submit .line'));
  }

  // Esc and the way back go back without logging in (main.js).
  return { open, place, start() { ready = true; place(); } };
}
