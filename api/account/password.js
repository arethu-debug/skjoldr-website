// ============================================================
// SKJOLDR — Change your own password
//   POST /api/account/password  { current, next, confirm }
// Used at first login (temporary password) and any time later from the menu.
// The current password is always required, so a session left open on
// someone else's screen is not enough to take over the account.
// ============================================================

import { sessionFromRequest } from '../../lib/session.js';
import { hashPassword, verifyPassword, normaliseEmail } from '../../lib/users.js';
import { kvConfigured } from '../../lib/kv.js';
import { readStoredUsers, writeStoredUsers, envUsers, audit, clearUserCache } from '../../lib/userstore.js';
import { passwordProblem } from '../../lib/passwordpolicy.js';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const FAIL_DELAY_MS = 1000;

function json(body, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'Request not allowed' }, 403);
  const session = await sessionFromRequest(request);
  if (!session) return json({ error: 'Your session has ended. Please log in again.' }, 401);
  if (!kvConfigured()) return json({ error: 'Passwords cannot be changed right now. Please contact your Skjoldr admin.' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const current = String(body.current || '');
  const next = String(body.next || '');
  const confirm = String(body.confirm || '');
  const email = normaliseEmail(session.email);

  let stored;
  try {
    stored = await readStoredUsers();
  } catch (err) {
    console.error(`[account] ${err.message}`);
    return json({ error: 'Passwords cannot be changed right now. Please try again in a moment.' }, 503);
  }
  const inStored = stored.find(u => normaliseEmail(u.email) === email);
  const inEnv = envUsers().find(u => normaliseEmail(u.email) === email);
  const user = inStored || inEnv;
  if (!user || user.disabled) return json({ error: 'Your session has ended. Please log in again.' }, 401);

  if (!(await verifyPassword(current, user.hash))) {
    await new Promise(r => setTimeout(r, FAIL_DELAY_MS));
    return json({ error: 'Your current password is not correct.', field: 'current' }, 400);
  }
  if (next !== confirm) return json({ error: 'The two new passwords are not the same.', field: 'confirm' }, 400);
  const problem = passwordProblem(next, { current, email });
  if (problem) return json({ error: problem, field: 'next' }, 400);

  const now = new Date().toISOString();
  let entry = inStored;
  if (!entry) {
    // A user so far only in SKJOLDR_USERS: the database copy takes over from now on.
    entry = { email: inEnv.email, name: inEnv.name || inEnv.email, role: inEnv.role, createdAt: now };
    stored.push(entry);
  }
  entry.hash = await hashPassword(next);
  delete entry.mustChange;
  delete entry.tempExpires;
  entry.passwordChangedAt = now;
  entry.updatedAt = now;

  try {
    await writeStoredUsers(stored);
  } catch (err) {
    console.error(`[account] ${err.message}`);
    return json({ error: 'The new password could not be saved. Please try again.' }, 500);
  }
  clearUserCache();
  await audit({ by: email, action: 'own-password', target: email });
  return json({ ok: true });
}
