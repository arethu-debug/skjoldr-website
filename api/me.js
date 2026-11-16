// GET /api/me — the signed-in user's display name and role, for the top bar.
// The role comes from the current user list, so a role change shows at once.

import { sessionFromRequest } from '../lib/session.js';
import { loadUsersCached } from '../lib/userstore.js';
import { normaliseEmail } from '../lib/users.js';

export async function GET(request) {
  const session = await sessionFromRequest(request);
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!session) return Response.json({ error: 'Not signed in' }, { status: 401, headers });
  const { users } = await loadUsersCached();
  const me = users.find(u => normaliseEmail(u.email) === normaliseEmail(session.email));
  if (!me || me.disabled) return Response.json({ error: 'Not signed in' }, { status: 401, headers });
  return Response.json({ email: me.email, name: me.name || session.name, role: me.role }, { headers });
}
