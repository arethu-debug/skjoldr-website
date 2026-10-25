// ============================================================
// SKJOLDR — Login wall (Vercel Routing Middleware)
// Runs before every request. Public paths pass; everything else
// needs a valid session cookie and a role allowed for the path.
// ============================================================

import {
  PUBLIC_PATHS, BLOCKED_PATHS, BLOCKED_PREFIXES,
  levelForPath, roleHasLevel, previewAdmits,
} from './access-config.js';
import { sessionFromRequest } from './lib/session.js';

export const config = { runtime: 'nodejs' };

const NO_INDEX = 'noindex, nofollow';

// Same as next() from @vercel/functions: tells Vercel to continue serving the request.
function next() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}

// Decode and tidy the path so /%62rand/ or //brand/ can't dodge the level checks.
function normalisePath(pathname) {
  let p = decodeURIComponent(pathname);
  p = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  return p;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function forbiddenPage(session) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>No access — Skjoldr</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body class="auth-page">
  <main class="auth-card">
    <a href="/" class="nav__logo auth-card__logo">
      <div class="nav__logo-mark">S</div>
      <span class="nav__logo-text">Skjoldr</span>
    </a>
    <span class="label">Error 403</span>
    <h1 class="auth-card__title">You don't have access to this page</h1>
    <p class="auth-card__text">
      You are signed in as <strong>${escapeHtml(session.name || session.email)}</strong>,
      but your access level does not include this page.
      If you think you should have access, contact your Skjoldr admin.
    </p>
    <div class="auth-card__actions">
      <a href="/" class="btn btn--primary btn--sm">Back to home</a>
      <a href="/api/logout" class="btn btn--outline btn--sm">Log out</a>
    </div>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 403,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': NO_INDEX,
    },
  });
}

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Robots-Tag': NO_INDEX },
  });
}

// Absolute Location built from the request URL; a relative one gets resolved
// against an internal address by some proxies (e.g. vercel dev).
function redirectToLogin(url) {
  const login = new URL('/login.html', url);
  login.searchParams.set('next', url.pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: { Location: login.href, 'Cache-Control': 'no-store', 'X-Robots-Tag': NO_INDEX },
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);

  let path;
  try {
    path = normalisePath(url.pathname);
  } catch {
    return new Response('Bad request', { status: 400, headers: { 'X-Robots-Tag': NO_INDEX } });
  }
  const lower = path.toLowerCase();

  if (BLOCKED_PATHS.includes(lower) || BLOCKED_PREFIXES.some(p => lower.startsWith(p))) {
    return notFound();
  }

  if (PUBLIC_PATHS.includes(lower)) return next();

  const session = await sessionFromRequest(request);
  if (!session) return redirectToLogin(url);

  if (process.env.VERCEL_ENV === 'preview' && !previewAdmits(session.role, process.env.VERCEL_GIT_COMMIT_REF)) {
    return forbiddenPage(session);
  }

  if (!roleHasLevel(session.role, levelForPath(path))) {
    return forbiddenPage(session);
  }

  return next();
}
