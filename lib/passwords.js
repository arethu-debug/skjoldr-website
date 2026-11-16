// ============================================================
// SKJOLDR — Random passwords for new users and resets
// Shared by the admin panel (api/admin/users.js) and scripts/add-user.mjs.
// ============================================================

import { randomInt } from 'node:crypto';

export const PASSWORD_LENGTH = 20;

// No look-alike characters (0/O, 1/l/I) so passwords are easy to read out.
const SETS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  'abcdefghijkmnopqrstuvwxyz',
  '23456789',
  '!#%+-=?@_',
];

export function generatePassword() {
  const all = SETS.join('');
  // One character from each set, the rest from all of them, then shuffle.
  const chars = SETS.map(set => set[randomInt(set.length)]);
  while (chars.length < PASSWORD_LENGTH) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
