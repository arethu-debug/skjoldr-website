// ============================================================
// SKJOLDR — Admin API for users (admin role only)
//   GET  /api/admin/users  -> users (never hashes), recent audit log
//   POST /api/admin/users  -> { action, email, name?, role? }
//        actions: add | reset | role | disable | enable | delete
// A new or reset password is returned once, in the response to that
// request, and is never stored or logged anywhere in plain text.
// ============================================================

import { ROLES } from '../../access-config.js';
import { sessionFromRequest } from '../../lib/session.js';
import { hashPassword, normaliseEmail } from '../../lib/users.js';
import { generatePassword } from '../../lib/passwords.js';
import { kvConfigured } from '../../lib/kv.js';
import {
  loadUsers, readStoredUsers, writeStoredUsers, envUsers, audit, readAudit, clearUserCache,
} from '../../lib/userstore.js';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

function publicUser(u) {
  return {
    email: u.email,
    name: u.name || '',
    role: u.role,
    disabled: Boolean(u.disabled),
    source: u.source,
    createdAt: u.createdAt || null,
    updatedAt: u.updatedAt || null,
  };
}

// The caller must hold a valid session AND still be an active admin right now.
async function requireAdmin(request) {
  const session = await sessionFromRequest(request);
  if (!session) return { error: json({ error: 'Not signed in' }, 401) };
  const { users } = await loadUsers();
  const me = users.find(u => normaliseEmail(u.email) === normaliseEmail(session.email));
  if (!me || me.disabled || me.role !== 'admin') return { error: json({ error: 'Admins only' }, 403) };
  return { me };
}

// Blocks requests sent from other sites (cross-site request forgery).
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { users, db } = await loadUsers();
  let log = [];
  try { log = await readAudit(50); } catch { /* shown as empty */ }
  return json({
    db,
    roles: ROLES,
    users: users.map(publicUser).sort((a, b) => a.email.localeCompare(b.email)),
    audit: log,
  });
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'Request not allowed' }, 403);
  const { me, error } = await requireAdmin(request);
  if (error) return error;
  if (!kvConfigured()) return json({ error: 'The database is not connected, so users cannot be changed here yet.' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const action = String(body.action || '');
  const email = normaliseEmail(body.email);
  const isSelf = email === normaliseEmail(me.email);

  let stored;
  try {
    stored = await readStoredUsers();
  } catch (err) {
    console.error(`[admin] ${err.message}`);
    return json({ error: 'The database could not be read. Nothing was changed.' }, 503);
  }
  const env = envUsers();
  const inStored = stored.find(u => normaliseEmail(u.email) === email);
  const inEnv = env.find(u => normaliseEmail(u.email) === email);
  const current = inStored || inEnv;
  const now = new Date().toISOString();
  const by = me.email;

  // For changes to a user that so far only exists in SKJOLDR_USERS, a copy is
  // made in the database; from then on the database entry is the one used.
  function editable() {
    if (inStored) return inStored;
    const copy = { email: inEnv.email, name: inEnv.name || inEnv.email, role: inEnv.role, hash: inEnv.hash, createdAt: now };
    stored.push(copy);
    return copy;
  }

  async function save(entry, extra = {}) {
    await writeStoredUsers(stored);
    clearUserCache();
    await audit({ by, action, target: email, ...entry });
    return json({ ok: true, ...extra });
  }

  try {
    switch (action) {
      case 'add': {
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        const role = String(body.role || '').toLowerCase();
        if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
        if (!name) return json({ error: 'Please enter a name.' }, 400);
        if (!ROLES.includes(role)) return json({ error: 'Please choose a role.' }, 400);
        if (current) return json({ error: 'A user with this email already exists. Use "Reset password" instead.' }, 409);
        const password = generatePassword();
        stored.push({ email, name, role, hash: await hashPassword(password), createdAt: now, updatedAt: now });
        return await save({ role }, { password });
      }
      case 'reset': {
        if (!current) return json({ error: 'No such user.' }, 404);
        const password = generatePassword();
        const u = editable();
        u.hash = await hashPassword(password);
        u.updatedAt = now;
        return await save({}, { password });
      }
      case 'role': {
        const role = String(body.role || '').toLowerCase();
        if (!current) return json({ error: 'No such user.' }, 404);
        if (!ROLES.includes(role)) return json({ error: 'Unknown role.' }, 400);
        if (isSelf && role !== 'admin') return json({ error: 'You cannot remove your own admin role.' }, 400);
        const u = editable();
        u.role = role;
        u.updatedAt = now;
        return await save({ role });
      }
      case 'disable':
      case 'enable': {
        if (!current) return json({ error: 'No such user.' }, 404);
        if (isSelf) return json({ error: 'You cannot disable yourself.' }, 400);
        const u = editable();
        u.disabled = action === 'disable';
        u.updatedAt = now;
        return await save({});
      }
      case 'delete': {
        if (!current) return json({ error: 'No such user.' }, 404);
        if (isSelf) return json({ error: 'You cannot delete yourself.' }, 400);
        if (inEnv) {
          // Removing the database entry would bring back the SKJOLDR_USERS one,
          // so the user is kept, disabled, until it is removed in Vercel too.
          const u = editable();
          u.disabled = true;
          u.updatedAt = now;
          return await save({ note: 'disabled; still in SKJOLDR_USERS' }, {
            note: 'This user is also listed in SKJOLDR_USERS in Vercel, so they have been disabled instead of deleted.',
          });
        }
        stored = stored.filter(u => normaliseEmail(u.email) !== email);
        return await save({});
      }
      default:
        return json({ error: 'Unknown action.' }, 400);
    }
  } catch (err) {
    console.error(`[admin] ${action} failed: ${err.message}`);
    return json({ error: 'The change could not be saved. Please try again.' }, 500);
  }
}
