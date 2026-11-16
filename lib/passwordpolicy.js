// ============================================================
// SKJOLDR — Temporary passwords and rules for choosing your own
// ============================================================

export const TEMP_DAYS = 7;
export const MIN_LENGTH = 12;
export const MAX_LENGTH = 200;
export const CHANGE_PATH = '/account/password/';

// Paths a user with a temporary password may still open.
const ALLOWED_WHILE_TEMP = ['/account/password', '/api/account/password', '/api/me', '/api/logout'];

export function tempExpiry(now = new Date()) {
  return new Date(now.getTime() + TEMP_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function tempExpired(user, now = Date.now()) {
  return Boolean(user && user.mustChange && user.tempExpires && Date.parse(user.tempExpires) <= now);
}

export function allowedWhileTemp(pathname) {
  const p = pathname.toLowerCase();
  return ALLOWED_WHILE_TEMP.some(a => p === a || p.startsWith(a + '/'));
}

const WEAK_PARTS = ['password', 'passord', 'skjoldr', 'neoco', 'qwerty', 'asdfgh', '123456', 'abcdef', 'letmein', 'welcome', 'velkommen'];

// Returns a short reason the new password is not acceptable, or null if it is fine.
export function passwordProblem(next, { current = '', email = '' } = {}) {
  if (typeof next !== 'string' || next.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (next.length > MAX_LENGTH) return `Use at most ${MAX_LENGTH} characters.`;
  if (next === current) return 'Choose a password that is different from the temporary one.';
  const lower = next.toLowerCase();
  if (/^(.)\1+$/.test(next)) return 'Do not repeat the same character.';
  if (new Set(lower).size < 5) return 'Use more different characters.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) return 'Do not use your email address in the password.';
  if (WEAK_PARTS.some(w => lower.includes(w))) return 'That password is too easy to guess. Avoid common words such as "password", "skjoldr" or "123456".';
  return null;
}
