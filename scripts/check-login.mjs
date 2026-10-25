#!/usr/bin/env node
// ============================================================
// SKJOLDR — Diagnose a failing login without revealing secrets
// Usage: node scripts/check-login.mjs
// Asks for the SKJOLDR_USERS value (as entered in Vercel), an email and a
// password, all with hidden input, and reports only yes/no style results.
// It never prints the password, any hash or the pasted value.
// ============================================================

import { parseUsers, userProblems, findUser, verifyPassword, normaliseEmail, HASH_FORMAT } from '../lib/users.js';
import { ask, exit } from './prompt.mjs';

// ---------- reporting ----------

let failures = 0;
const ok = msg => console.log(`  OK    ${msg}`);
const bad = msg => { failures++; console.log(`  FAIL  ${msg}`); };
const warn = msg => console.log(`  WARN  ${msg}`);
const note = msg => console.log(`        ${msg}`);

function whitespaceIssues(value) {
  const issues = [];
  if (/[\r\n]/.test(value)) issues.push('contains a line break');
  if (/\t/.test(value)) issues.push('contains a tab');
  if (value !== value.trim()) issues.push('has leading or trailing whitespace');
  return issues;
}

// ---------- main ----------

console.log('SKJOLDR login check — nothing you type is shown or printed.\n');
console.log('Paste the SKJOLDR_USERS value exactly as entered in Vercel, then press Enter.');
console.log('(If it is not accepted after one Enter, press Enter once more on an empty line.)');
const raw = await ask('SKJOLDR_USERS: ', { hidden: true, json: true });
note(`received ${raw.length} characters`);
const email = await ask('Email: ', { hidden: true });
const password = await ask('Password: ', { hidden: true });

console.log('\n1) JSON');
const { users, error } = parseUsers(raw);
if (error) {
  bad(error);
  const t = raw.trim();
  if (/^'.*'$/s.test(t) || (/^".*"$/s.test(t))) {
    note('The value looks wrapped in quotes. In the Vercel UI, enter the JSON without surrounding quotes.');
  }
  if (/[\r\n]/.test(t)) {
    note('The value contains line breaks. A line break inside a "..." string (e.g. a hash split');
    note('over two lines when pasting) makes the JSON invalid. Re-paste each entry as one line.');
  }
} else {
  ok('parses as JSON and is an array');
}

console.log('\n2) Entries');
if (!error) {
  (users.length ? ok : bad)(`contains ${users.length} user${users.length === 1 ? '' : 's'}`);
  const overall = whitespaceIssues(raw);
  if (overall.length) warn(`the whole value ${overall.join(', ')} (harmless between entries, shown for completeness)`);
  let entryIssues = 0;
  users.forEach((u, i) => {
    if (!u || typeof u !== 'object') return;
    for (const field of ['email', 'name', 'role', 'hash']) {
      if (typeof u[field] !== 'string') continue;
      const issues = whitespaceIssues(u[field]);
      if (issues.length) {
        entryIssues++;
        // Emails are trimmed at login, so whitespace there doesn't break anything.
        (field === 'email' || field === 'name' ? warn : bad)(`entry ${i + 1}: "${field}" ${issues.join(', ')}`);
      }
    }
  });
  if (!entryIssues) ok('no line breaks or stray whitespace inside any entry');
  const problems = userProblems(users);
  for (const p of problems) bad(p);
  if (!problems.length) ok('every entry has email, name, a known role and a well-formed hash');
} else {
  note('skipped (fix the JSON first)');
}

console.log('\n3) Email');
let user = null;
if (!error) {
  user = findUser(users, email);
  if (user) ok(`found (entry ${users.indexOf(user) + 1}, matched case-insensitively)`);
  else bad('not found in SKJOLDR_USERS (compared case-insensitively, surrounding spaces ignored)');
  if (!normaliseEmail(email)) note('the email you typed was empty');
} else {
  note('skipped');
}

console.log('\n4) Password');
if (user) {
  if (!HASH_FORMAT.test(user.hash || '')) {
    bad("that user's hash is malformed, so no password can match");
  } else if (await verifyPassword(password, user.hash)) {
    ok('matches the stored hash');
  } else {
    bad('does not match the stored hash');
    if (password !== password.trim()) note('the password you typed has leading/trailing spaces; passwords are not trimmed');
  }
} else {
  note('skipped (no matching user)');
}

console.log('');
if (failures) {
  console.log(`${failures} problem${failures === 1 ? '' : 's'} found. Fix SKJOLDR_USERS in Vercel, then redeploy.`);
} else {
  console.log('Everything checks out locally. If the preview still refuses this login, check:');
  console.log('  - SKJOLDR_USERS and SESSION_SECRET are enabled for the Preview environment (not only Production);');
  console.log('  - the deployment was redeployed after the variables were saved;');
  console.log('  - the Vercel function log for /api/login: lines starting with "[login]" say what went wrong;');
  console.log('  - on sandbox/* previews only role "admin" gets in; other roles see "You don\'t have access".');
}
await exit(failures ? 1 : 0);
