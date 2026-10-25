#!/usr/bin/env node
// ============================================================
// SKJOLDR — Create a user entry for SKJOLDR_USERS
// Usage: node scripts/add-user.mjs
// Prints a new random password ONCE and the JSON entry (hash only).
// ============================================================

import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { randomInt } from 'node:crypto';
import { hashPassword } from '../lib/users.js';
import { ROLES } from '../access-config.js';

const PASSWORD_LENGTH = 20;
// No look-alike characters (0/O, 1/l/I) so passwords are easy to read out.
const SETS = [
  'ABCDEFGHJKLMNPQRSTUVWXYZ',
  'abcdefghijkmnopqrstuvwxyz',
  '23456789',
  '!#%+-=?@_',
];

function generatePassword() {
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

const rl = createInterface({ input: stdin, terminal: false });
// Read through one line iterator so pasted/piped answers aren't dropped.
const lines = rl[Symbol.asyncIterator]();

async function ask(question, validate) {
  for (;;) {
    stdout.write(question);
    const { value, done } = await lines.next();
    if (done) {
      console.error('\nInput ended before all questions were answered.');
      process.exit(1);
    }
    const answer = value.trim();
    const error = validate(answer);
    if (!error) return answer;
    console.log(`  ${error}`);
  }
}

const email = (await ask('Email: ', v =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Please enter a valid email address.'
)).toLowerCase();

const name = await ask('Name: ', v => (v ? null : 'Please enter a name.'));

const role = (await ask(`Role (${ROLES.join(', ')}): `, v =>
  ROLES.includes(v.toLowerCase()) ? null : `Role must be one of: ${ROLES.join(', ')}.`
)).toLowerCase();

rl.close();

const password = generatePassword();
const hash = await hashPassword(password);

console.log('');
console.log('================================================================');
console.log(' PASSWORD (shown only once — store it safely now, e.g. in a');
console.log(' password manager, and send it to the user over a secure channel):');
console.log('');
console.log(`   ${password}`);
console.log('');
console.log(' It cannot be recovered later. If it is lost, run this script');
console.log(' again and replace the user entry.');
console.log('================================================================');
console.log('');
console.log('User entry for SKJOLDR_USERS (contains the hash only):');
console.log('');
console.log(JSON.stringify({ email, name, role, hash }));
console.log('');
