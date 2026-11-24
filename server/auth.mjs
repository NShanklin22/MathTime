// Passwords (scrypt, a random salt per password) and session tokens (32 random bytes, kept as SHA-256).
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const N = 16384, R = 8, P = 1, KEYLEN = 64;

function derive(password, salt, n, r, p, keylen) {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      (err ? reject(err) : resolve(key))));
}

// "scrypt$N$r$p$salt$hash", salt and hash in base64.
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEYLEN);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

// A stored hash that isn't scrypt (a Google account's '!') never matches, but is compared against
// DUMMY_HASH all the same, so the time taken doesn't tell which accounts have no password.
export async function verifyPassword(password, stored) {
  const real = String(stored).startsWith('scrypt$');
  const [, n, r, p, salt, hash] = (real ? String(stored) : DUMMY_HASH).split('$');
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), expected.length);
  return timingSafeEqual(key, expected) && real;
}

// Compared against when the name is unknown, so a wrong name takes as long as a wrong password.
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
