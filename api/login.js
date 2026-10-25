// POST /api/login — check credentials, set the session cookie, redirect.

import { authenticate } from '../lib/users.js';
import { createToken, sessionCookie, safeNext, SHORT_TTL, LONG_TTL } from '../lib/session.js';
import { ROLES } from '../access-config.js';

const FAIL_DELAY_MS = 1000;

function redirect(location, extraHeaders = {}) {
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', ...extraHeaders },
  });
}

async function readForm(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) return await request.json();
  const form = await request.formData();
  return Object.fromEntries(form.entries());
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
  const user = await authenticate(fields.email, fields.password);

  if (!user || !ROLES.includes(user.role)) {
    await new Promise(r => setTimeout(r, FAIL_DELAY_MS));
    const back = new URLSearchParams({ error: '1' });
    if (next !== '/') back.set('next', next);
    return redirect(`/login.html?${back}`);
  }

  const ttl = fields.remember ? LONG_TTL : SHORT_TTL;
  const token = await createToken(
    { email: user.email, name: user.name || user.email, role: user.role },
    ttl,
    process.env.SESSION_SECRET
  );
  return redirect(next, { 'Set-Cookie': sessionCookie(token, ttl) });
}
