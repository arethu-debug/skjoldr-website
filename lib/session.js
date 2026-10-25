// ============================================================
// SKJOLDR — Session cookie helpers (Web Crypto, HMAC-SHA256)
// Shared by middleware.js and the /api functions.
// Token format: base64url(JSON payload) "." base64url(HMAC signature)
// ============================================================

export const COOKIE_NAME = 'skjoldr_session';
export const SHORT_TTL = 12 * 60 * 60;       // 12 hours, in seconds
export const LONG_TTL  = 30 * 24 * 60 * 60;  // 30 days, in seconds

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// Describes what is wrong with the secret (never its value), or null if usable.
export function secretProblem(secret) {
  if (!secret) return 'SESSION_SECRET is not set (or is empty) for this deployment';
  if (secret.length < 32) return 'SESSION_SECRET is set but shorter than the required 32 characters';
  return null;
}

async function hmacKey(secret) {
  const problem = secretProblem(secret);
  if (problem) throw new Error(problem);
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function createToken({ email, name, role }, ttlSeconds, secret) {
  const payload = { email, name, role, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

// Returns the payload, or null if the token is missing, forged, malformed or expired.
export async function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const [body, sig] = parts;
    // subtle.verify compares the signature in constant time.
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(body)));
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now() / 1000) return null;
    if (typeof payload.email !== 'string' || typeof payload.role !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}

export function readCookie(cookieHeader, name = COOKIE_NAME) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Host-only cookie: deliberately no Domain attribute.
export function sessionCookie(token, maxAgeSeconds) {
  return `${COOKIE_NAME}=${token}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export async function sessionFromRequest(request) {
  return verifyToken(readCookie(request.headers.get('cookie')), process.env.SESSION_SECRET);
}

// Only same-site relative paths are allowed as a post-login destination.
export function safeNext(next) {
  if (typeof next !== 'string' || next === '') return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return '/';
  try {
    const base = 'https://skjoldr.invalid';
    const url = new URL(next, base);
    if (url.origin !== base) return '/';
    const path = url.pathname + url.search + url.hash;
    if (path.startsWith('/login.html') || path.startsWith('/api/')) return '/';
    return path;
  } catch {
    return '/';
  }
}
