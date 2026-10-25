// ============================================================
// SKJOLDR — Users and password hashing (Node only: node:crypto)
// Users come from the SKJOLDR_USERS env var:
//   [{"email":"...","name":"...","role":"...","hash":"scrypt$<salt-hex>$<hash-hex>"}]
// Nothing here ever logs or returns passwords, hashes or env values.
// ============================================================

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ROLES } from '../access-config.js';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

// scrypt$<16-byte salt as 32 hex>$<64-byte key as 128 hex>
export const HASH_FORMAT = /^scrypt\$[0-9a-fA-F]{32}\$[0-9a-fA-F]{128}$/;

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

// Parses the raw SKJOLDR_USERS value. `error` describes what is wrong without
// quoting any of the value (JSON.parse messages include a snippet, so only the
// position is kept).
export function parseUsers(raw) {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return { users: [], error: 'SKJOLDR_USERS is not set (or is empty) for this deployment' };
  }
  let users;
  try {
    users = JSON.parse(raw);
  } catch (err) {
    const pos = /position (\d+)/.exec(String(err && err.message));
    return { users: [], error: `SKJOLDR_USERS is not valid JSON${pos ? ` (parse error at character ${pos[1]})` : ''}` };
  }
  if (!Array.isArray(users)) {
    return { users: [], error: `SKJOLDR_USERS is valid JSON but not an array (got ${users === null ? 'null' : typeof users}); it must look like [{...}, {...}]` };
  }
  return { users, error: null };
}

// Problems with individual entries, by entry number and field name only.
export function userProblems(users) {
  const problems = [];
  const seen = new Map();
  users.forEach((u, i) => {
    const n = `entry ${i + 1}`;
    if (!u || typeof u !== 'object' || Array.isArray(u)) {
      problems.push(`${n}: is not an object`);
      return;
    }
    for (const field of ['email', 'name', 'role', 'hash']) {
      if (typeof u[field] !== 'string' || u[field] === '') problems.push(`${n}: "${field}" is missing or not a string`);
    }
    if (typeof u.role === 'string' && !ROLES.includes(u.role)) {
      problems.push(`${n}: "role" is not one of ${ROLES.join(', ')} (roles are lower-case)`);
    }
    if (typeof u.hash === 'string' && !HASH_FORMAT.test(u.hash)) {
      problems.push(`${n}: "hash" is not in the format scrypt$<32 hex>$<128 hex> (possibly truncated, or "$" parts lost)`);
    }
    if (typeof u.email === 'string') {
      const key = normaliseEmail(u.email);
      if (seen.has(key)) problems.push(`${n}: same email as entry ${seen.get(key)} (only the first one is used)`);
      else seen.set(key, i + 1);
    }
  });
  return problems;
}

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function findUser(users, email) {
  const wanted = normaliseEmail(email);
  return users.find(u => u && typeof u.email === 'string' && normaliseEmail(u.email) === wanted) || null;
}

// Returns { user, reason }: user is set only on success; reason is a short,
// value-free explanation of a failure for the function log.
export async function authenticate(users, email, password) {
  const user = findUser(users, email);
  const ok = await verifyPassword(String(password || ''), user ? user.hash : DUMMY_HASH);
  if (!user) return { user: null, reason: 'no user with that email' };
  if (!ok) {
    return { user: null, reason: HASH_FORMAT.test(user.hash || '') ? 'wrong password' : 'stored hash for that user is malformed' };
  }
  if (!ROLES.includes(user.role)) return { user: null, reason: 'user has an unknown role' };
  return { user, reason: null };
}
