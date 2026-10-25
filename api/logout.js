// GET|POST /api/logout — clear the session cookie and go back to the login page.

import { clearedCookie } from '../lib/session.js';

function logout() {
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/login.html',
      'Set-Cookie': clearedCookie(),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export const GET = logout;
export const POST = logout;
