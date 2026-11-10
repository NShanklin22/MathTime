// A fresh API on a random port with an in-memory database and a clock the test moves.
import { createServer } from 'node:http';
import { openDb, createCode } from '../store.mjs';
import { createApp } from '../app.mjs';
import { buildRecord } from '../../src/record.js';

// trustProxy is on by default, as behind nginx, so each call can come from its own X-Real-IP.
export async function startApi({ cookieSecure = true, trustProxy = true, addressLimit, db = openDb(':memory:'), t = Date.parse('2026-11-09T12:00:00Z') } = {}) {
  const clock = { t };
  const server = createServer(createApp({ db, now: () => clock.t, cookieSecure, trustProxy, addressLimit }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let ipCount = 0;

  const api = {
    db,
    clock,
    base,
    // Each call comes from a new address unless one is given, so rate limits only bite where tested.
    async call(method, path, { body, cookie, ip, headers = {}, raw } = {}) {
      const init = { method, headers: { 'X-Real-IP': ip || `10.0.0.${++ipCount % 250}`, ...headers } };
      if (cookie) init.headers.Cookie = cookie;
      if (raw !== undefined) init.body = raw;
      else if (body !== undefined) {
        init.headers['Content-Type'] ??= 'application/json';
        init.body = JSON.stringify(body);
      }
      const res = await fetch(base + path, init);
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      const setCookie = res.headers.getSetCookie();
      return { status: res.status, json, text, headers: res.headers, setCookie };
    },
    invite: () => createCode(db, { now: clock.t }),
    // Signs up a new account; returns its cookie ("mt_session=...").
    async signup(name, password = 'password1') {
      const res = await api.call('POST', '/api/signup', { body: { invite: api.invite(), name, password } });
      if (res.status !== 201) throw new Error(`signup ${name}: ${res.status} ${res.text}`);
      return cookieOf(res);
    },
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }),
  };
  return api;
}

// "mt_session=<token>" from a response's Set-Cookie, for sending back.
export function cookieOf(res) {
  const line = res.setCookie.find((c) => c.startsWith('mt_session='));
  return line && line.split(';')[0];
}

// A record as the browser makes it (src/record.js), so the tests follow its shape.
export function record(over = {}) {
  const result = {
    level: 1,
    totalMs: 45000.4,
    misses: 1,
    problems: Array.from({ length: 20 }, (_, i) => ({ a: i % 10, b: 3, ms: 2250.2, misses: i === 0 ? 1 : 0 })),
  };
  return { ...buildRecord(result), ...over };
}
