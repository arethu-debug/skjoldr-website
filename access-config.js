// ============================================================
// SKJOLDR — Access configuration
// Edit this file to change which paths need which TLP level,
// which roles may see which levels, and who may use previews.
// ============================================================

// Traffic Light Protocol levels.
export const LEVELS = ['CLEAR', 'GREEN', 'AMBER', 'RED'];

// Path prefix -> required level. The first matching prefix wins;
// anything that matches no prefix is DEFAULT_LEVEL.
// Prefixes are compared case-insensitively.
export const PATH_LEVELS = [
  { prefix: '/restricted/', level: 'RED' },
  { prefix: '/internal/',   level: 'AMBER' },
  { prefix: '/brand/',      level: 'GREEN' },
];

export const DEFAULT_LEVEL = 'CLEAR';

// Role -> levels that role may open.
export const ROLE_LEVELS = {
  admin:      ['CLEAR', 'GREEN', 'AMBER', 'RED'],
  board:      ['CLEAR', 'GREEN', 'AMBER', 'RED'],
  core:       ['CLEAR', 'GREEN', 'AMBER'],
  developer:  ['CLEAR', 'GREEN'],
  consultant: ['CLEAR', 'GREEN'],
  agency:     ['CLEAR', 'GREEN'],
  partner:    ['CLEAR'],
};

export const ROLES = Object.keys(ROLE_LEVELS);

// Preview deployments (VERCEL_ENV === 'preview'): git branch prefix ->
// roles admitted at all. Branches that match no prefix use PREVIEW_DEFAULT_ROLES.
// Admitted users are then still subject to the normal level rules above.
export const PREVIEW_BRANCH_ROLES = [
  { prefix: 'sandbox/', roles: ['admin'] },
  { prefix: 'dev/',     roles: ['admin', 'developer'] },
];

export const PREVIEW_DEFAULT_ROLES = ['admin'];

// Paths reachable without logging in (exact match, after normalisation).
export const PUBLIC_PATHS = [
  '/login.html',
  '/style.css',
  '/robots.txt',
  '/favicon.ico',
  '/api/login',
  '/api/logout',
];

// Source and tooling files that live in the project root but must never be served.
export const BLOCKED_PATHS = [
  '/middleware.js',
  '/access-config.js',
  '/package.json',
  '/package-lock.json',
  '/vercel.json',
  '/readme.md',
];

export const BLOCKED_PREFIXES = ['/lib/', '/scripts/', '/node_modules/', '/.'];

// ------------------------------------------------------------

export function levelForPath(pathname) {
  const p = pathname.toLowerCase();
  for (const { prefix, level } of PATH_LEVELS) {
    if (p.startsWith(prefix) || p === prefix.slice(0, -1)) return level;
  }
  return DEFAULT_LEVEL;
}

export function roleHasLevel(role, level) {
  return (ROLE_LEVELS[role] || []).includes(level);
}

export function previewAdmits(role, branch) {
  const ref = branch || '';
  const rule = PREVIEW_BRANCH_ROLES.find(r => ref.startsWith(r.prefix));
  return (rule ? rule.roles : PREVIEW_DEFAULT_ROLES).includes(role);
}
