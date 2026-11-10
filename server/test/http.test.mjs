// Request checks: content type, body size, unknown routes, health (accounts spec §6).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startApi } from './helpers.mjs';

let api;
beforeEach(async () => { api = await startApi(); });
afterEach(() => api.close());

const json = { 'Content-Type': 'application/json' };

test('GET /api/healthz is 200 ok', async () => {
  const res = await api.call('GET', '/api/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.text, 'ok');
});

test('415 for a POST body that is not application/json', async () => {
  const cookie = await api.signup('sam');
  for (const [path, type] of [
    ['/api/login', 'text/plain'],
    ['/api/signup', 'application/x-www-form-urlencoded'],
    ['/api/runs', 'text/plain;charset=UTF-8'],
    ['/api/logout', 'text/plain'],
  ]) {
    const res = await api.call('POST', path,
      { cookie, raw: '{"name":"sam","password":"password1"}', headers: { 'Content-Type': type } });
    assert.equal(res.status, 415, path);
  }
  const noType = await api.call('POST', '/api/login', { raw: new Blob(['{"name":"sam"}']) });
  assert.equal(noType.status, 415, 'no Content-Type at all');
  const ok = await api.call('POST', '/api/login',
    { body: { name: 'sam', password: 'password1' }, headers: { 'Content-Type': 'Application/JSON; charset=utf-8' } });
  assert.equal(ok.status, 200, 'a charset is fine');
});

test('a body over 64KB is refused with 413; exactly 64KB is fine', async () => {
  const cookie = await api.signup('sam');
  const pad = (n) => JSON.stringify({ name: 'sam', password: 'password1', pad: 'x'.repeat(n) });
  const base = pad(0).length;
  const exact = pad(64 * 1024 - base);
  assert.equal(Buffer.byteLength(exact), 64 * 1024);
  assert.equal((await api.call('POST', '/api/login', { raw: exact, headers: json })).status, 200);
  const over = pad(64 * 1024 - base + 1);
  assert.equal((await api.call('POST', '/api/login', { raw: over, headers: json })).status, 413);
  assert.equal((await api.call('POST', '/api/runs', { cookie, raw: 'x'.repeat(1_000_000), headers: json })).status, 413);
});

test('413 also for a chunked body that grows past 64KB', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = request(`${api.base}/api/login`, { method: 'POST', headers: json },
      (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    for (let i = 0; i < 10; i++) req.write('x'.repeat(10 * 1024));   // no Content-Length: chunked
    req.end();
  });
  assert.equal(status, 413);
});

test('unknown routes are 404, a known route with the wrong method 405', async () => {
  for (const path of ['/api', '/api/', '/api/nope', '/api/runs/1', '/index.html', '/api/ME']) {
    assert.equal((await api.call('GET', path)).status, 404, path);
  }
  assert.equal((await api.call('POST', '/api/nope', { body: {} })).status, 404);
  const wrong = await api.call('GET', '/api/login');
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get('allow'), 'POST');
  assert.equal((await api.call('DELETE', '/api/runs')).status, 405);
});

test('a query string does not change the route', async () => {
  assert.equal((await api.call('GET', '/api/healthz?x=1')).text, 'ok');
});

test('answers are JSON and never cached', async () => {
  const res = await api.call('GET', '/api/me');
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});
