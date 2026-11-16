// ============================================================
// SKJOLDR — Login wall (Vercel Routing Middleware)
// Runs before every request. Public paths pass; everything else
// needs a valid session cookie and a role allowed for the path.
// ============================================================

import {
  PUBLIC_PATHS, BLOCKED_PATHS, BLOCKED_PREFIXES,
  levelForPath, roleHasLevel, previewAdmits, isAdminOnly,
} from './access-config.js';
import { sessionFromRequest, clearedCookie } from './lib/session.js';
import { loadUsers, loadUsersCached } from './lib/userstore.js';
import { allowedWhileTemp, CHANGE_PATH } from './lib/passwordpolicy.js';
import { normaliseEmail } from './lib/users.js';

export const config = { runtime: 'nodejs' };

const NO_INDEX = 'noindex, nofollow';

// The Skjoldr logo (same artwork as the site header), inlined for the no-access page.
const LOGO_SVG = `<svg class="auth__logo" viewBox="140 290 910 262" role="img" aria-label="Skjoldr"><path fill="currentColor" d="M500 439.5C501.4 457.7 515.9 469.7 536.6 469.7 554.8 469.7 567.7 461.4 567.7 446.7 567.7 429.9 551.1 426.4 530.6 422.9 508.7 419.2 486.3 412.1 486.3 385.8 486.3 362.8 505.1 347.3 532.5 347.3 561.5 347.3 580.9 364.1 582.4 388.5L565.8 388.5C563.9 372.8 550.7 362.6 532.5 362.6 514.9 362.6 503.1 370.3 503.1 384.8 503.1 401.1 519.5 404.3 539.9 407.8 562 411.5 584.6 418.8 584.6 445.1 584.6 468.5 564.9 485 536.4 485 504.1 485 484.4 466.2 483.4 439.5L500 439.5Z"/><path fill="currentColor" d="M618 348.4 618 438.2 668.1 385.2 687.1 385.2 649.2 425.6 689.8 483.8 670.6 483.8 637.7 437 618 457.7 618 483.8 602.1 483.8 602.1 348.4 618 348.4Z"/><path fill="currentColor" d="M689.8 508C697.7 508 700.6 504.7 700.6 497.2L700.6 385.2 716.5 385.2 716.5 496.8C716.5 514.2 709.1 522.5 690.8 522.5L677.5 522.5 677.5 508 689.8 508ZM718.8 357.5C718.8 363.5 714.4 367.8 708.5 367.8 702.7 367.8 698.2 363.5 698.2 357.5 698.2 351.5 702.7 347.2 708.5 347.2 714.4 347.3 718.8 351.5 718.8 357.5Z"/><path fill="currentColor" d="M731.4 434.5C731.4 404.5 751.5 384 780.3 384 809.1 384 829.2 404.5 829.2 434.5 829.2 464.5 809.2 485 780.4 485 751.6 485 731.4 464.5 731.4 434.5ZM813.1 434.5C813.1 413.4 799.9 398.1 780.4 398.1 760.9 398.1 747.7 413.4 747.7 434.5 747.7 455.6 760.9 470.9 780.4 470.9 799.9 470.9 813.1 455.6 813.1 434.5Z"/><path fill="currentColor" d="M861.3 348.4 861.3 483.8 845.4 483.8 845.4 348.4 861.3 348.4Z"/><path fill="currentColor" d="M974.1 348.4 974.1 483.8 960.4 483.8 958.3 467.9C951.7 477 941.1 484.9 924.4 484.9 897.1 484.9 877 466.5 877 434.4 877 404.2 897.1 383.9 924.4 383.9 941 383.9 952.3 390.7 958.3 400.2L958.3 348.4 974.1 348.4ZM958.5 434.9C958.5 413.2 945.3 398.1 926 398.1 906.5 398.1 893.3 413 893.3 434.5 893.3 456 906.5 470.9 926 470.9 945.3 470.9 958.5 456 958.5 434.9Z"/><path fill="currentColor" d="M1044.4 385.2 1044.4 400.7 1036.5 400.7C1015.8 400.7 1010.2 417.9 1010.2 433.6L1010.2 483.9 994.3 483.9 994.3 385.2 1008 385.2 1010.1 400.1C1014.7 392.6 1022.3 385.2 1039.9 385.2L1044.4 385.2Z"/><path fill="currentColor" d="M382.8 347 333 297.2 333 297.2 275 297.2 249.8 297.2 196 297.2 196 297.2 146.2 347 185.9 386.7 146.2 426.4 264.5 544.7 382.8 426.4 343.1 386.7 382.8 347ZM354.5 426.4 264.5 516.4 174.5 426.4 214.2 386.7 214.2 386.7 214.2 386.7 174.5 347 204.3 317.2 251 317.2 276.6 317.2 324.7 317.2 354.5 347 314.8 386.7 314.8 386.7 314.8 386.7 354.5 426.4Z"/></svg>`;

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
  <title>No access · Skjoldr</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/auth.css" />
</head>
<body>
  <main class="auth">
    <div class="auth__brand">${LOGO_SVG}<span class="auth__tag">Shared Vision</span></div>
    <section class="auth__card">
      <p class="auth__eyebrow">Error 403</p>
      <h1 class="auth__title">You don't have access to this page</h1>
      <p class="auth__intro">
        You are signed in as <strong>${escapeHtml(session.name || session.email)}</strong>,
        but your access level does not include this page.
        If you think you should have access, contact your Skjoldr admin.
      </p>
      <div class="auth__actions">
        <a href="/" class="auth__btn">Back to home</a>
        <a href="/api/logout" class="auth__btn auth__btn--line">Log out</a>
      </div>
    </section>
    <p class="auth__foot">Skjoldr AS · Shared Vision</p>
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
function redirectToLogin(url, { clearCookie = false } = {}) {
  const login = new URL('/login.html', url);
  login.searchParams.set('next', url.pathname + url.search);
  const headers = { Location: login.href, 'Cache-Control': 'no-store', 'X-Robots-Tag': NO_INDEX };
  if (clearCookie) headers['Set-Cookie'] = clearedCookie();
  return new Response(null, { status: 302, headers });
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

  const token = await sessionFromRequest(request);
  if (!token) return redirectToLogin(url);

  // The cookie proves who logged in; the current user list decides whether
  // they still have access and with which role. Deleted or disabled users
  // are signed out, and role changes apply, within about 30 seconds.
  const { users } = await loadUsersCached();
  let user = users.find(u => normaliseEmail(u.email) === normaliseEmail(token.email));
  if (!user || user.disabled) return redirectToLogin(url, { clearCookie: true });

  // A temporary password must be replaced before anything else can be opened.
  // The cached list may be up to 30 s old, so check the fresh one before redirecting.
  if (user.mustChange && !allowedWhileTemp(path)) {
    const fresh = (await loadUsers()).users.find(u => normaliseEmail(u.email) === normaliseEmail(token.email));
    if (fresh && fresh.mustChange) {
      const to = new URL(CHANGE_PATH, url);
      to.searchParams.set('next', url.pathname + url.search);
      return new Response(null, { status: 302, headers: { Location: to.href, 'Cache-Control': 'no-store', 'X-Robots-Tag': NO_INDEX } });
    }
    if (fresh) user = fresh;
  }
  const session = { ...token, role: user.role, name: user.name || token.name };

  if (isAdminOnly(path) && session.role !== 'admin') {
    return forbiddenPage(session);
  }

  if (process.env.VERCEL_ENV === 'preview' && !previewAdmits(session.role, process.env.VERCEL_GIT_COMMIT_REF)) {
    return forbiddenPage(session);
  }

  if (!roleHasLevel(session.role, levelForPath(path))) {
    return forbiddenPage(session);
  }

  return next();
}
