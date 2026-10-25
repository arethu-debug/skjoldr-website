#!/usr/bin/env node
// ============================================================
// SKJOLDR — Add a user (or reset a password) for SKJOLDR_USERS
// Usage: node scripts/add-user.mjs        (Windows; uses the `clip` command)
// Generates a random password and hands over the results through the
// clipboard in two steps: first the password, then the complete
// SKJOLDR_USERS value. Neither the password nor any hash is printed.
// ============================================================

import { randomInt } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { hashPassword, parseUsers, userProblems, findUser, normaliseEmail } from '../lib/users.js';
import { ROLES } from '../access-config.js';
import { ask, exit } from './prompt.mjs';

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

// ---------- clipboard (Windows) ----------

// clip.exe takes UTF-16LE input as Unicode, so names with æ/ø/å survive
// whatever the console code page is. No BOM: clip would copy it as an
// invisible extra character. No trailing newline is added.
function copyToClipboard(text) {
  const r = spawnSync('clip', { input: Buffer.from(text, 'utf16le') });
  return r.status === 0;
}

// Reads the clipboard back to confirm the copy is exact, character for
// character (no added BOM or line break). Returns null if it can't be read.
function clipboardMatches(text) {
  const r = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8; [Console]::Out.Write((Get-Clipboard -Raw))',
  ], { encoding: 'utf8' });
  if (r.status !== 0 || typeof r.stdout !== 'string') return null;
  return r.stdout === text;
}

async function copyStep(label, text) {
  if (!copyToClipboard(text)) {
    console.error(`  Could not run the Windows "clip" command, so the ${label} was not copied.`);
    await exit(1);
  }
  const check = clipboardMatches(text);
  if (check === false) {
    console.error(`  The clipboard does not contain the expected ${label}. Please run the script again.`);
    await exit(1);
  }
  console.log(`  Copied the ${label} to the clipboard (${text.length} characters${check ? ', verified' : ''}).`);
}

// ---------- questions ----------

async function askValid(question, validate) {
  for (;;) {
    const answer = (await ask(question)).trim();
    const error = validate(answer);
    if (!error) return answer;
    console.log(`  ${error}`);
  }
}

if (process.platform !== 'win32') {
  console.error('This script copies to the clipboard with the Windows "clip" command, so it only runs on Windows.');
  await exit(1);
}

const email = normaliseEmail(await askValid('Email: ', v =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Please enter a valid email address.'
));

const name = (await askValid('Name: ', v => (v ? null : 'Please enter a name.'))).replace(/\s+/g, ' ');

const role = (await askValid(`Role (${ROLES.join(', ')}): `, v =>
  ROLES.includes(v.toLowerCase()) ? null : `Role must be one of: ${ROLES.join(', ')}.`
)).toLowerCase();

console.log('');
console.log('To add this user to your existing list, paste the current SKJOLDR_USERS value');
console.log('from Vercel and press Enter (input is hidden). To start a new list, just press Enter.');
console.log('(If it is not accepted after one Enter, press Enter once more on an empty line.)');

let users = [];
for (;;) {
  const raw = await ask('Existing SKJOLDR_USERS: ', { hidden: true, json: true });
  if (raw.trim() === '') break;
  const parsed = parseUsers(raw);
  if (parsed.error) {
    console.log(`  ${parsed.error}. Paste it again, or press Enter to start a new list.`);
    continue;
  }
  users = parsed.users;
  console.log(`  Read ${users.length} existing user${users.length === 1 ? '' : 's'}.`);
  for (const p of userProblems(users)) console.log(`  Warning: ${p}`);
  break;
}

const existing = findUser(users, email);
if (existing) {
  const n = users.indexOf(existing) + 1;
  const answer = (await ask(`A user with this email already exists (entry ${n}). Replace it with a new password? [y/N]: `)).trim();
  if (!/^y(es)?$/i.test(answer)) {
    console.log('Nothing changed.');
    await exit(0);
  }
}

const password = generatePassword();
const entry = { email, name, role, hash: await hashPassword(password) };
const updated = existing ? users.map(u => (u === existing ? entry : u)) : [...users, entry];
// One line, wrapped in [ ], no whitespace between tokens.
const value = JSON.stringify(updated);

console.log('');
console.log(`${existing ? 'Replaced' : 'Added'} ${email} (${role}). The list now has ${updated.length} user${updated.length === 1 ? '' : 's'}.`);

console.log('');
console.log('Step 1 of 2 — the password (shown only through the clipboard, never on screen)');
await ask('  Press Enter to copy the PASSWORD to the clipboard...', { hidden: true });
await copyStep('password', password);
console.log('  Paste it into your password manager now. It cannot be recovered later.');
await ask('  Press Enter when you have stored it...', { hidden: true });

console.log('');
console.log('Step 2 of 2 — the SKJOLDR_USERS value');
await ask('  Press Enter to copy the complete SKJOLDR_USERS value to the clipboard...', { hidden: true });
await copyStep('SKJOLDR_USERS value', value);
console.log('  (This also replaced the password in the clipboard.)');

console.log('');
console.log('Next:');
console.log('  1. In Vercel → Settings → Environment Variables, edit SKJOLDR_USERS, select the whole');
console.log('     old value, paste to replace it, and save (for Preview and/or Production).');
console.log('  2. Redeploy so the change takes effect.');
console.log('  3. Send the password to the user over a secure channel.');
console.log('  If Windows clipboard history is on (Win+V), delete the password entry from it.');
await exit(0);
