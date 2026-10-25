// ============================================================
// SKJOLDR — Users and password hashing (Node only: node:crypto)
// Users come from the SKJOLDR_USERS env var:
//   [{"email":"...","name":"...","role":"...","hash":"scrypt$<salt-hex>$<hash-hex>"}]
// ============================================================

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

// Used when the email is unknown, so a miss costs the same time as a wrong password.
const DUMMY_HASH = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(KEY_LEN);

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LEN, SCRYPT_OPTS);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length !== KEY_LEN) return false;
  const actual = await scryptAsync(password, salt, KEY_LEN, SCRYPT_OPTS);
  return timingSafeEqual(actual, expected);
}

export function loadUsers() {
  try {
    const users = JSON.parse(process.env.SKJOLDR_USERS || '[]');
    return Array.isArray(users) ? users : [];
  } catch {
    console.error('SKJOLDR_USERS is not valid JSON');
    return [];
  }
}

// Returns the matching user, or null. Always runs one scrypt comparison.
export async function authenticate(email, password) {
  const wanted = String(email || '').trim().toLowerCase();
  const user = loadUsers().find(u => typeof u.email === 'string' && u.email.trim().toLowerCase() === wanted);
  const ok = await verifyPassword(String(password || ''), user ? user.hash : DUMMY_HASH);
  return ok && user ? user : null;
}
