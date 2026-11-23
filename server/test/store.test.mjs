// Identities and pending sign-ups for Google sign-in (open sign-up spec §3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../store.mjs';

const { openDb } = store;

test('an identity links a provider subject to a user', () => {
  const db = openDb(':memory:');
  const id = store.createUser(db, { name: 'gina', pwHash: '!', now: 1 });
  store.addIdentity(db, { provider: 'google', subject: 's1', userId: id, now: 1 });
  assert.equal(store.userByIdentity(db, 'google', 's1').id, id);
  assert.equal(store.userByIdentity(db, 'google', 's2'), undefined);
  assert.equal(store.userByIdentity(db, 'apple', 's1'), undefined);
});

test('a subject links to one account only', () => {
  const db = openDb(':memory:');
  const a = store.createUser(db, { name: 'gina', pwHash: '!', now: 1 });
  const b = store.createUser(db, { name: 'gino', pwHash: '!', now: 1 });
  store.addIdentity(db, { provider: 'google', subject: 's1', userId: a, now: 1 });
  assert.throws(() => store.addIdentity(db, { provider: 'google', subject: 's1', userId: b, now: 2 }));
});

test('a pending sign-up is found until it expires, and taken once', () => {
  const db = openDb(':memory:');
  store.addPending(db, { tokenHash: 'h', provider: 'google', subject: 's1', expiresAt: 100, now: 0 });
  assert.equal(store.findPending(db, 'h', 99).subject, 's1');
  assert.equal(store.findPending(db, 'h', 100), undefined);
  store.deletePending(db, 'h');
  assert.equal(store.findPending(db, 'h', 0), undefined);
});

test('writing a pending row clears expired ones', () => {
  const db = openDb(':memory:');
  store.addPending(db, { tokenHash: 'old', provider: 'google', subject: 'a', expiresAt: 10, now: 0 });
  store.addPending(db, { tokenHash: 'new', provider: 'google', subject: 'b', expiresAt: 100, now: 50 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pending').get().n, 1);
});

test('a pending sign-up lasts 15 minutes', () => {
  assert.equal(store.PENDING_LIFE, 15 * 60 * 1000);
});
