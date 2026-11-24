// Google sign-in's pure parts (open sign-up spec §2): the consent screen's URL, PKCE, and the ID
// token's claims. The routes are in app.mjs; nothing here talks to Google.
import { randomBytes, createHash } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// A verifier of 43 characters (32 random bytes) and its S256 challenge (RFC 7636).
export function pkce() {
  const verifier = b64u(randomBytes(32));
  return { verifier, challenge: b64u(createHash('sha256').update(verifier).digest()) };
}

// openid only: Google's account id (sub) is all MathTime keeps. select_account, so a shared
// computer always asks which Google account.
export function authUrl({ clientId, redirectUri, state, challenge }) {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid',
    state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  });
  return `${AUTH}?${q}`;
}

// The ID token came straight from Google's token endpoint over TLS, so its claims are
// checked and its signature is not (OIDC Core 3.1.3.7, item 6). Gives the sub; throws an
// error naming the claim that failed, never the token itself.
export function checkIdToken(jwt, { clientId, now }) {
  let claims;
  try {
    claims = JSON.parse(Buffer.from(String(jwt).split('.')[1] ?? '', 'base64url').toString());
  } catch {
    throw new Error('id token');
  }
  if (!claims || typeof claims !== 'object') throw new Error('id token');
  if (!ISSUERS.includes(claims.iss)) throw new Error('iss');
  if (claims.aud !== clientId) throw new Error('aud');
  if (!(claims.exp * 1000 > now)) throw new Error('exp');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('sub');
  return claims.sub;
}
