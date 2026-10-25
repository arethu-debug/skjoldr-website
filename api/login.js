// POST /api/login — check credentials, set the session cookie, redirect.
// Problems are logged to the Vercel function log with a "[login]" prefix;
// the logs never contain passwords, hashes, emails or env values.

import { parseUsers, userProblems, authenticate } from '../lib/users.js';
import { createToken, sessionCookie, safeNext, secretProblem, SHORT_TTL, LONG_TTL } from '../lib/session.js';

const FAIL_DELAY_MS = 1000;

function redirect(location, extraHeaders = {}) {
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', ...extraHeaders },
  });
}

function backToLogin(error, next) {
  const back = new URLSearchParams({ error });
  if (next !== '/') back.set('next', next);
  return redirect(`/login.html?${back}`);
}

async function readForm(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) return await request.json();
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

function deploymentLabel() {
  const env = process.env.VERCEL_ENV || 'unknown';
  const ref = process.env.VERCEL_GIT_COMMIT_REF;
  return ref ? `${env}, branch ${ref}` : env;
}

// Checks the env config; logs every problem found. Returns true if login can work.
function configOk(users, usersError) {
  const errors = [];
  const secretError = secretProblem(process.env.SESSION_SECRET);
  if (secretError) errors.push(secretError);
  if (usersError) errors.push(usersError);
  else if (users.length === 0) errors.push('SKJOLDR_USERS is an empty array, so nobody can log in');

  for (const e of errors) {
    console.error(`[login] CONFIG ERROR (${deploymentLabel()}): ${e}. Fix it in Vercel → Settings → Environment Variables, then redeploy.`);
  }
  if (!usersError) {
    for (const p of userProblems(users)) console.warn(`[login] SKJOLDR_USERS ${p}`);
  }
  return errors.length === 0;
}

export async function GET() {
  return redirect('/login.html');
}

export async function POST(request) {
  let fields;
  try {
    fields = await readForm(request);
  } catch {
    fields = {};
  }
  const next = safeNext(fields.next);

  const { users, error: usersError } = parseUsers(process.env.SKJOLDR_USERS);
  if (!configOk(users, usersError)) return backToLogin('unavailable', next);

  const { user, reason } = await authenticate(users, fields.email, fields.password);
  if (!user) {
    console.warn(`[login] failed attempt: ${reason}`);
    await new Promise(r => setTimeout(r, FAIL_DELAY_MS));
    return backToLogin('1', next);
  }

  const ttl = fields.remember ? LONG_TTL : SHORT_TTL;
  const token = await createToken(
    { email: user.email, name: user.name || user.email, role: user.role },
    ttl,
    process.env.SESSION_SECRET
  );
  return redirect(next, { 'Set-Cookie': sessionCookie(token, ttl) });
}
