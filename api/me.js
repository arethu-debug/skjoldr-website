// GET /api/me — the signed-in user's display name and role, for the top bar.

import { sessionFromRequest } from '../lib/session.js';

export async function GET(request) {
  const session = await sessionFromRequest(request);
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!session) return Response.json({ error: 'Not signed in' }, { status: 401, headers });
  return Response.json({ name: session.name, role: session.role }, { headers });
}
