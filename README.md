# RETRO.CASH

> Mobile-first **personal finance + expense tracking** PWA with a **minimal retro UI**.
> **100% offline.** All data lives on your device. Zero external/paid APIs.

---

## What's in the box

- **Auth** — local PIN (PBKDF2-hashed via Web Crypto) + optional biometric (Touch ID / Face / fingerprint via WebAuthn) + auto-lock on inactivity.
- **Income / Expense / Transfer** — full CRUD, recurring entries with daily/weekly/monthly schedules, optional voice input.
- **Multiple accounts** — Cash, Bank, UPI, Card, Wallets — manual balances, transfers between accounts.
- **Categories + Budgets** — monthly limits per category, progress bars, threshold notifications (80% / 100%).
- **Expense splitting** — equal / custom amount / percentage. Maintains a **per-contact ledger** (who owes whom). Send settle-up nudges via the **native share sheet** (Web Share API) with **WhatsApp deep link** fallback (`https://wa.me/<phone>?text=...`). **No Twilio**, no cost.
- **Analytics** — pure-canvas charts: pie (category), bar (monthly), line (income vs expense over 6 months).
- **Local notifications** — bill / split / budget alerts via the in-page Notification API. No server.
- **Backup & restore** — export/import JSON, export CSV — all generated locally.
- **UPI settle helper** — generate a `upi://pay?...` link for quick settlements; copy/share/open.
- **Offline-first PWA** — service worker caches the shell; data lives in **IndexedDB**.

---

## Tech stack

| Layer        | Choice                                          |
| ------------ | ----------------------------------------------- |
| UI           | Vanilla JS + CSS (no framework, no build step)  |
| State        | Tiny pub/sub store ([js/state.js](js/state.js)) |
| Storage      | **IndexedDB** ([js/db.js](js/db.js))            |
| Auth crypto  | Web Crypto (PBKDF2 + SHA-256)                   |
| Biometric    | WebAuthn platform authenticator                 |
| Charts       | Canvas 2D ([js/charts.js](js/charts.js))        |
| Share        | Web Share API + `wa.me` / `sms:` / `mailto:`    |
| Notifications| Notification API                                |
| PWA          | Service worker + manifest                       |

No npm install required. No transpiler. Open `index.html` in a modern browser.

---

## Local schema (IndexedDB)

| Store               | Key   | Notable fields                                                                       |
| ------------------- | ----- | ------------------------------------------------------------------------------------ |
| `meta`              | `key` | `user`: { id, username, salt, pinHash, hasBiometric, biometricCredId, autoLockMs }   |
| `accounts`          | `id`  | name, type (cash/bank/upi/card/wallet), balance, color                               |
| `categories`        | `id`  | name, type (expense/income), icon, color                                             |
| `transactions`      | `id`  | type, amount, accountId, toAccountId, categoryId, notes, ts, recurring, recurringRule|
| `splits`            | `id`  | title, totalAmount, payerName, splitType (equal/custom/percentage), createdAt        |
| `splitParticipants` | `id`  | splitId, name, phone, amountOwed, status (pending/settled), settledAt                |
| `budgets`           | `id`  | categoryId, monthlyLimit, period                                                     |
| `notifications`     | `id`  | title, body, fireAt, status (pending/fired)                                          |

Account balances are derived from transactions and recomputed on every change ([db.js → recalcAccountBalance](js/db.js)).

---

## Run it

### Option 1 — fastest (no server, file://)

Some features (Service Worker, Web Share on iOS, full WebAuthn) require a secure origin. For day-to-day local use you can simply double-click `index.html`. The app will run; SW won't register but everything else works.

### Option 2 — local server (recommended)

Any static server. From this directory:

```bash
# Python 3
python -m http.server 8080

# or Node
npx serve -l 8080
```

Then open `http://localhost:8080` on your laptop, or `http://<your-lan-ip>:8080` on your phone (same WiFi).

For biometric auth on a real device you'll want HTTPS — easiest is to host on Netlify / Cloudflare Pages / GitHub Pages, or use a tunneling tool like [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or `ngrok`.

### Option 3 — install as an app

Open the served URL on your phone → "Add to Home Screen" (iOS Safari) or "Install app" (Chrome/Edge on Android & desktop). It then runs full-screen like a native app.

---

## First-run flow

1. Open the app → "FIRST RUN" screen.
2. Pick a username + 4–8-digit PIN. The PIN is hashed (PBKDF2, 150k iterations, random per-user salt) before being written to IndexedDB. Plaintext is never stored.
3. Default accounts (Cash, Bank, UPI, Card) and category sets (Food, Transport, Bills, etc.) are seeded.
4. Open *Settings* → *Biometric* → ENROLL to bind a WebAuthn platform credential to your vault, so you can unlock with Touch ID / Face / fingerprint.

Auto-lock defaults to 1 minute of inactivity; configurable in Settings (off / 30s / 1m / 5m / 15m).

---

## Architecture

```
index.html
├── css/styles.css                    – retro theme tokens + components
├── manifest.json + sw.js             – PWA shell, offline caching
├── icons/                            – app icons
└── js/
    ├── utils.js          – DOM helpers, formatters, modal, toast
    ├── crypto.js         – PBKDF2 / AES-GCM via Web Crypto
    ├── db.js             – IndexedDB wrapper + balance recalc
    ├── state.js          – tiny pub/sub store
    ├── auth.js           – setup, unlock, biometric, auto-lock
    ├── notifications.js  – local Notification API + recurring scheduler
    ├── share.js          – Web Share API + wa.me deep link
    ├── charts.js         – Canvas pie/bar/line
    ├── export.js         – JSON / CSV export, JSON import
    ├── router.js         – hash-based router
    ├── app.js            – wiring/boot
    └── views/
        ├── dashboard.js
        ├── transactions.js
        ├── add.js
        ├── split.js
        ├── analytics.js
        ├── accounts.js
        ├── budgets.js
        └── settings.js
```

### Offline-first architecture

- **Reads & writes** go to IndexedDB only. No fetch calls anywhere except for the shell (cached by SW).
- **Recurring transactions** are stored locally with a `recurringRule` and spawned on a 30s tick by [notifications.js](js/notifications.js).
- **Service worker** caches every JS/CSS/SVG file at install — the app loads with the radio off.

### Sync

There is **no cloud sync** — by design, per the spec. The export/import JSON flow ([js/export.js](js/export.js)) gives you full data portability if you want to move between devices.

### Privacy / security

- PIN: PBKDF2-SHA256, 150,000 iterations, 16-byte random salt.
- Biometric: WebAuthn platform credential — verification is performed by the OS; the app holds only a credential ID, not the biometric data.
- Optional AES-GCM payload encryption helpers are exposed in [crypto.js](js/crypto.js) for future opt-in encryption of high-sensitivity fields.

---

## Tested browser features

| Feature              | Required? | Fallback                                    |
| -------------------- | --------- | ------------------------------------------- |
| IndexedDB            | yes       | (none — required)                           |
| Web Crypto           | yes       | (none — required)                           |
| WebAuthn (biometric) | optional  | PIN-only login                              |
| Web Share API        | optional  | WhatsApp deep link via `wa.me` opens new tab|
| Notification API     | optional  | falls back to in-app toast                  |
| SpeechRecognition    | optional  | mic button hidden when unsupported          |
| Service Worker       | optional  | app still works, just not preinstalled offline |

Known limitations:

- iOS Web Share supports text-only out of the box; that's all this app sends.
- iOS PWA notifications require iOS 16.4+ and the app installed to the home screen.
- File downloads (export) work everywhere modern; on iOS they prompt "Download" and land in Files.

---

## Performance

- **No external network** at runtime once cached → instant cold start.
- IndexedDB reads are batched in [State.refreshAll](js/state.js); the largest hot path (add transaction) recomputes only the affected account balance.
- Charts are pure canvas — sub-millisecond paint on a 6-month dataset.

---

## License

MIT — do whatever you want; this is your money.
