# Skjoldr training website

Static HTML/CSS site deployed on Vercel. Every page sits behind a login wall:

| File | What it does |
| --- | --- |
| `middleware.js` | Vercel Routing Middleware. Runs before every request; redirects to `/login.html` without a valid session, returns a 403 page when the user's role doesn't cover the page. |
| `access-config.js` | **The one file to edit for access rules**: path → TLP level, role → allowed levels, preview-branch rules, public paths. |
| `api/login.js` | Checks email + password against `SKJOLDR_USERS`, sets the `skjoldr_session` cookie. |
| `api/logout.js` | Clears the cookie. |
| `api/me.js` | Returns the signed-in user's name and role (used by `auth-bar.js` for the "name · Log out" bar). |
| `lib/session.js`, `lib/users.js` | Cookie signing (HMAC-SHA256) and password hashing (scrypt). |
| `scripts/add-user.mjs` | Adds a user (or resets a password) and copies the password and the new `SKJOLDR_USERS` value to the clipboard. |
| `scripts/check-login.mjs` | Diagnoses a failing login without revealing secrets. |

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Value |
| --- | --- |
| `SESSION_SECRET` | A long random string (at least 32 characters). Changing it signs everyone out. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `SKJOLDR_USERS` | A JSON array of user entries, e.g. `[{"email":"a@skjoldr.no","name":"Ada","role":"admin","hash":"scrypt$…$…"}, …]` |

Set both for **Production** and **Preview**. Mark them **Sensitive**. A change only takes effect after a redeploy.

## Access levels

| Path | Level |
| --- | --- |
| everything else | CLEAR |
| `/brand/…` | GREEN |
| `/internal/…` | AMBER |
| `/restricted/…` | RED |

| Role | Levels |
| --- | --- |
| admin, board | CLEAR, GREEN, AMBER, RED |
| core | CLEAR, GREEN, AMBER |
| developer, consultant, agency | CLEAR, GREEN |
| partner | CLEAR |

Preview deployments are stricter: `sandbox/*` branches admit only admin, `dev/*` branches admit admin and developer, and every other preview branch admits only admin. Production uses the table above.

## Managing users

All users live in the `SKJOLDR_USERS` environment variable in Vercel. Passwords are never stored, only their scrypt hashes.

### Add a user

Use `scripts/add-user.mjs` (Windows). It hands everything over through the clipboard and never prints the password or any hash.

1. In this folder run:

   ```sh
   node scripts/add-user.mjs
   ```

2. Enter the email, name and role (`admin`, `developer`, `core`, `board`, `consultant`, `agency` or `partner`).
3. When asked for the existing `SKJOLDR_USERS`, copy the current value from Vercel (Settings → Environment Variables → `SKJOLDR_USERS` → reveal/edit) and paste it. Input is hidden. Press Enter on an empty line if it isn't accepted after one Enter. For the very first user, just press Enter to start a new list.
4. **Step 1:** press Enter to copy the **password** to the clipboard and paste it into your password manager. It can't be shown again.
5. **Step 2:** press Enter to copy the complete new `SKJOLDR_USERS` value: the whole list on one line, wrapped in `[ ]`. Each copy is read back and checked character by character.
6. In Vercel, edit `SKJOLDR_USERS`, select the whole old value, paste over it and save. Do this for Production and/or Preview.
7. Redeploy (Deployments → ⋯ → Redeploy) so the change takes effect, then send the person their password over a secure channel.

If Windows clipboard history (Win+V) is on, delete the password from it afterwards.

### Reset a password

Run `node scripts/add-user.mjs` with the same email and paste the existing list. The script sees that the user exists and asks whether to replace them with a new password. Answer `y`, then follow steps 4–7 above. The other users stay unchanged.

Sessions that are already signed in stay valid until they expire (12 hours, or 30 days with "Keep me signed in"). To sign **everyone** out immediately, change `SESSION_SECRET` and redeploy.

### Remove a user

1. Delete the user's entry from `SKJOLDR_USERS` and redeploy. They can no longer log in.
2. An existing session keeps working until it expires. To cut them off at once, also change `SESSION_SECRET` and redeploy (this signs everyone out).

### Change someone's role

Edit the `role` in their entry and redeploy. The new role applies the next time they log in. Change `SESSION_SECRET` as well if it must apply right away.

### Login doesn't work?

Run `node scripts/check-login.mjs`, paste the `SKJOLDR_USERS` value exactly as it is in Vercel, and enter the email and password (all hidden). It reports whether the JSON is valid, how many users it holds, any line breaks or stray whitespace in an entry, whether the email is found and whether the password matches. It never prints the password, hashes or the value.

Also check the Vercel function log for `/api/login`. Lines starting with `[login]` say what's wrong: a missing or invalid `SESSION_SECRET` or `SKJOLDR_USERS`, a bad entry, or why an attempt failed. They never contain secrets, passwords, hashes or emails.

## Local development

```sh
npx vercel login
npx vercel link            # pick the existing skjoldr-website project
npx vercel dev
```

Put a test `SESSION_SECRET` and `SKJOLDR_USERS` in a local `.env` file. It is git-ignored and never uploaded; never commit real users or secrets.
