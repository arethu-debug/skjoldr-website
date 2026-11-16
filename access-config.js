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
// CLEAR: public face (home, about, contact). GREEN: customers, end-users and
// Beta testers (training, operating manuals, modules, glossary).
// AMBER: team and partners under NDA (brand book, STILA tools, internal). RED: named individuals.
export const PATH_LEVELS = [
  { prefix: '/restricted/', level: 'RED' },
  { prefix: '/internal/',   level: 'AMBER' },
  { prefix: '/brand/',      level: 'AMBER' },
  { prefix: '/manuals/',    level: 'GREEN' },
  { prefix: '/training',    level: 'GREEN' },  // training.html and any /training/ pages
  { prefix: '/module',      level: 'GREEN' },  // modules.html and module-*.html
  { prefix: '/glossary',    level: 'GREEN' },
  { prefix: '/firemap',     level: 'AMBER' },  // STILA tools
];

export const DEFAULT_LEVEL = 'CLEAR';

// Paths for the admin role only (stricter than RED, which the board also has).
export const ADMIN_ONLY_PREFIXES = ['/restricted/admin', '/api/admin'];

export function isAdminOnly(pathname) {
  const p = pathname.toLowerCase();
  return ADMIN_ONLY_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'));
}

// Role -> levels that role may open.
export const ROLE_LEVELS = {
  admin:      ['CLEAR', 'GREEN', 'AMBER', 'RED'],
  board:      ['CLEAR', 'GREEN', 'AMBER', 'RED'],
  core:       ['CLEAR', 'GREEN', 'AMBER'],
  developer:  ['CLEAR', 'GREEN'],
  consultant: ['CLEAR', 'GREEN'],
  agency:     ['CLEAR', 'GREEN', 'AMBER'],  // after NDA
  partner:    ['CLEAR'],
  customer:   ['CLEAR', 'GREEN'],           // needs login Stage 1 before use
  beta:       ['CLEAR', 'GREEN'],           // concept validation testers
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
  '/auth.css',
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
