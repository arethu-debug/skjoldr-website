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
| `scripts/add-user.mjs` | Creates a user entry with a new random password. |

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

1. In this folder run:

   ```sh
   node scripts/add-user.mjs
   ```

2. Enter the email, name and role (`admin`, `developer`, `core`, `board`, `consultant`, `agency` or `partner`).
3. The script prints a random 20-character password **once**. Store it in a password manager and send it to the person over a secure channel. It cannot be shown again.
4. Copy the printed JSON line, e.g.
   `{"email":"kari@skjoldr.no","name":"Kari Nordmann","role":"core","hash":"scrypt$…$…"}`
5. In Vercel → Settings → Environment Variables, edit `SKJOLDR_USERS` and add the line to the array (separate entries with a comma, keep the surrounding `[` `]`). Do this for Production and Preview.
6. Redeploy (Deployments → ⋯ → Redeploy) so the change takes effect.

### Reset a password

1. Run `node scripts/add-user.mjs` again with the same email, name and role.
2. In `SKJOLDR_USERS`, replace that user's old entry (or just its `hash` value) with the new one. Make sure the email appears only once.
3. Redeploy and give the person their new password.

Sessions that are already signed in stay valid until they expire (12 hours, or 30 days with "Keep me signed in"). To sign **everyone** out immediately, change `SESSION_SECRET` and redeploy.

### Remove a user

1. Delete the user's entry from `SKJOLDR_USERS` and redeploy. They can no longer log in.
2. An existing session keeps working until it expires. To cut them off at once, also change `SESSION_SECRET` and redeploy (this signs everyone out).

### Change someone's role

Edit the `role` in their entry and redeploy. The new role applies the next time they log in. Change `SESSION_SECRET` as well if it must apply right away.

## Local development

```sh
npx vercel login
npx vercel link            # pick the existing skjoldr-website project
npx vercel dev
```

Put a test `SESSION_SECRET` and `SKJOLDR_USERS` in a local `.env` file. It is git-ignored and never uploaded; never commit real users or secrets.
