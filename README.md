# FINBUDDY

> Multi-user **personal finance + expense splitting** web app with a brutalist retro UI.
> Email/password login. Per-user data isolation. **Vercel** for the API. **Google Sheets** for storage. **WhatsApp deep-links** for sharing.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser (public/)                                                    │
│   login.html / register.html ─┐                                      │
│   index.html (auth-gated)     │   credentials                        │
│   IndexedDB (per-user cache)  ▼                                      │
└──────┬──────────────────────────────────────────────────────────────┘
       │  fetch  /api/auth/{register,login,logout,me}        cookie  ▲
       │  fetch  /api/data    { action, table, payload }              │
       ▼                                                              │
┌──────────────────────────────────────────────────────────────────────┐
│ Vercel Serverless (api/)                                             │
│   _lib/auth.js    JWT sign/verify, httpOnly cookie                   │
│   _lib/sheets.js  client for Apps Script                             │
│   auth/*          register / login / logout / me                     │
│   data.js         requires JWT, stamps userId on every row           │
└──────┬──────────────────────────────────────────────────────────────┘
       │  POST  { secret, action, table, payload }
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Google Apps Script Web App (integrations/sheets-apps-script.gs)      │
│   users  +  per-user-scoped data tabs                                │
└──────────────────────────────────────────────────────────────────────┘
```

The browser never sees the Apps Script URL or the shared secret. Per-user isolation is enforced server-side: the userId is read from the JWT and stamped onto every row going to the sheet, and reads are filtered by userId. The local IndexedDB is cleared whenever a different user signs in on the same browser.

---

## File layout

```
public/                              ← static frontend (Vercel serves this)
├── index.html                       — main app (auth-gated)
├── login.html, register.html        — auth pages
├── widget.html                      — compact balance/recent widget
├── manifest.json, sw.js
├── css/styles.css
├── icons/
└── js/
    ├── utils.js, db.js, state.js
    ├── auth-client.js               — talks to /api/auth/*
    ├── api/sheets.js                — talks to /api/data
    ├── notifications.js, share.js, charts.js, export.js, whatsapp.js
    ├── router.js, app.js
    └── views/                       — dashboard, transactions, add, split,
                                       analytics, accounts, budgets, categories,
                                       monthly, settings

api/                                 ← Vercel serverless backend
├── _lib/
│   ├── auth.js                      — JWT + cookie helpers
│   └── sheets.js                    — Apps Script client
├── auth/
│   ├── register.js                  — POST  email + password
│   ├── login.js                     — POST  → sets httpOnly cookie
│   ├── logout.js                    — POST  → clears cookie
│   └── me.js                        — GET   → current user
└── data.js                          — POST  authenticated CRUD proxy

integrations/
└── sheets-apps-script.gs            — Paste-into-Apps-Script storage layer

.env / .env.example                  — local dev secrets (gitignored)
.gitignore
package.json                         — bcryptjs + jsonwebtoken
vercel.json                          — clean URLs, headers, public/ root
```

---

## One-time setup (≈10 minutes)

### 1. Apps Script (storage)

1. Open <https://script.google.com> → **+ New project**.
2. Replace the default code with [integrations/sheets-apps-script.gs](integrations/sheets-apps-script.gs).
3. Set `SHARED_SECRET` to a long random string (you'll reuse it). Save.
4. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the **Web app URL**.

### 2. .env (for local dev)

```bash
cp .env.example .env
# then fill in:
#   APPS_SCRIPT_URL     = the Web app URL from step 1
#   APPS_SCRIPT_SECRET  = the same SHARED_SECRET you set in the script
#   JWT_SECRET          = node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

`.env` is gitignored — never commit it.

### 3. Install + run locally

```bash
npm install
npm install -g vercel        # if not installed
vercel link                  # links this folder to a Vercel project (one-time)
vercel dev                   # runs frontend + serverless on localhost
```

Open <http://localhost:3000>, register an account, sign in. CRUD goes through the local `vercel dev` server and on into your Apps Script.

### 4. Deploy to production

```bash
vercel --prod
```

In the Vercel dashboard → **Project → Settings → Environment Variables**, add (for **Production**):

| Name | Value |
|------|-------|
| `APPS_SCRIPT_URL` | the Web app URL from step 1 |
| `APPS_SCRIPT_SECRET` | the same `SHARED_SECRET` |
| `JWT_SECRET` | a different long random string |

Then redeploy (env vars are picked up at build time).

---

## How auth works

- `POST /api/auth/register` `{ email, password }` — bcrypt-hashes, writes to `users` tab.
- `POST /api/auth/login` `{ email, password }` — bcrypt-verifies, signs JWT, sets `fb_session` httpOnly + Secure + SameSite=Lax cookie (7 days by default).
- `GET  /api/auth/me` — reads cookie, returns `{ id, email }`.
- `POST /api/auth/logout` — clears the cookie.
- `POST /api/data` — every request requires the cookie; the server reads `userId` from the verified JWT and uses it to scope all CRUD.

Passwords: `bcryptjs` with cost 10. JWTs: HS256 signed with `JWT_SECRET`. Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` in production.

---

## How data isolation works

Every user-scoped tab (`transactions`, `accounts`, `categories`, `budgets`, `splits`, `splitParticipants`) has a `userId` column. The server:

- **Writes**: stamps `userId = session.id` onto every row before forwarding to Apps Script. The Apps Script `upsert` rejects writes that would overwrite another user's row (ownership guard).
- **Reads**: `pull` returns only rows whose `userId` matches the session.
- **Deletes**: only delete rows whose `userId` matches the session.
- **Replace** (used by "PUSH ALL → SHEET"): clears + rewrites only this user's rows; other users' rows are untouched.

The browser **cannot** spoof a userId — the value comes from the verified JWT, not from request body.

---

## WhatsApp — deep links only

```js
const message = "You owe ₹500 for dinner";
const url = `https://wa.me/919876543210?text=${encodeURIComponent(message)}`;
window.open(url, "_blank");
```

Tap → WhatsApp opens with prefilled text → user taps Send. No backend, no API keys, no rate limits, no cost. Implemented in [public/js/whatsapp.js](public/js/whatsapp.js); the Monthly view ships with a `✉ WHATSAPP` button that preloads the month's summary.

---

## Development tips

- **Run locally**: `vercel dev` (it reads `.env`).
- **Inspect the cookie**: DevTools → Application → Cookies → look for `fb_session`.
- **Reset a session**: clear `fb_session` cookie or call `POST /api/auth/logout`.
- **Reset all local data**: DevTools → Application → IndexedDB → delete `retro_cash_db`.
- **Rotate the JWT secret**: every existing session is invalidated immediately (everyone has to log back in).
- **Backup**: [export.js](public/js/export.js) still produces JSON / CSV downloads from the local cache.

---

## Production checklist

- [ ] `SHARED_SECRET` in Apps Script ≠ the default placeholder
- [ ] `JWT_SECRET` in Vercel ≠ a guessable value (use 64+ random bytes)
- [ ] `APPS_SCRIPT_URL` and `APPS_SCRIPT_SECRET` set in Vercel for **Production**
- [ ] Apps Script deployed as **Web app**, **Anyone** access (the secret is the lock)
- [ ] First registered user can log in, add a transaction, and see it in the sheet under their `userId`
- [ ] Second registered user cannot see the first user's rows

---

## License

MIT.
