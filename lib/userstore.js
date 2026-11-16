// ============================================================
// SKJOLDR — Where users live
//
// Two sources, merged by email:
//   1. The database (key "skjoldr:users"), managed in the admin panel.
//   2. SKJOLDR_USERS in Vercel: the safety net. An email that is only in
//      SKJOLDR_USERS still works, so the admin can always log in even if
//      the database is empty, broken or unreachable.
// When the same email is in both, the database entry wins.
//
// Each user: { email, name, role, hash, disabled?, createdAt?, updatedAt?, source }
// source is "db" or "env" and is added here; it is never stored.
// ============================================================

import { kvConfigured, kvCommand } from './kv.js';
import { parseUsers, normaliseEmail } from './users.js';

export const USERS_KEY = 'skjoldr:users';
export const AUDIT_KEY = 'skjoldr:audit';
const AUDIT_KEEP = 500;
const CACHE_MS = 30 * 1000;

let cache = null; // { at, result }

export function envUsers() {
  return parseUsers(process.env.SKJOLDR_USERS).users
    .filter(u => u && typeof u.email === 'string');
}

// Users stored in the database. Throws if the database can't be read.
export async function readStoredUsers() {
  if (!kvConfigured()) return [];
  const raw = await kvCommand(['GET', USERS_KEY]);
  if (raw === null || raw === undefined) return [];
  let list;
  try { list = JSON.parse(raw); } catch { throw new Error('stored user list is not valid JSON'); }
  if (!Array.isArray(list)) throw new Error('stored user list is not an array');
  return list.filter(u => u && typeof u.email === 'string');
}

export async function writeStoredUsers(list) {
  const clean = list.map(({ source, ...u }) => u);
  await kvCommand(['SET', USERS_KEY, JSON.stringify(clean)]);
  cache = null;
}

export function mergeUsers(stored, env) {
  const seen = new Set();
  const out = [];
  for (const u of stored) {
    const key = normaliseEmail(u.email);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...u, source: 'db' });
  }
  for (const u of env) {
    const key = normaliseEmail(u.email);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...u, source: 'env' });
  }
  return out;
}

// { users, db } where db is 'ok', 'off' (not connected) or 'error' (unreachable).
export async function loadUsers() {
  const env = envUsers();
  if (!kvConfigured()) return { users: mergeUsers([], env), db: 'off' };
  try {
    return { users: mergeUsers(await readStoredUsers(), env), db: 'ok' };
  } catch (err) {
    console.error(`[users] ${err.message}; using SKJOLDR_USERS only`);
    return { users: mergeUsers([], env), db: 'error' };
  }
}

// Same as loadUsers, but reuses the answer for up to 30 seconds. Used on every
// page request by the middleware, so changes made in the admin panel reach
// all running instances within half a minute.
export async function loadUsersCached() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.result;
  const result = await loadUsers();
  cache = { at: Date.now(), result };
  return result;
}

export function clearUserCache() {
  cache = null;
}

export async function audit(entry) {
  if (!kvConfigured()) return;
  try {
    await kvCommand(['LPUSH', AUDIT_KEY, JSON.stringify({ at: new Date().toISOString(), ...entry })]);
    await kvCommand(['LTRIM', AUDIT_KEY, '0', String(AUDIT_KEEP - 1)]);
  } catch (err) {
    console.error(`[admin] could not write the audit log: ${err.message}`);
  }
}

export async function readAudit(limit = 50) {
  if (!kvConfigured()) return [];
  const rows = await kvCommand(['LRANGE', AUDIT_KEY, '0', String(limit - 1)]);
  return (rows || []).map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}
