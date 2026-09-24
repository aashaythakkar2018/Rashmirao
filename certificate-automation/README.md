# Rhytara — Certificate of Authenticity System

A small local backend + dashboard for generating Certificate of Authenticity
PDFs. There is **no Shopify integration** and **no automatic emailing** —
every certificate is created by a staff member typing in the details on the
dashboard, downloading the PDF, and attaching/sending it themselves (e.g.
from their own Gmail).

This is a **separate backend service**, and it runs **locally only** — not
deployed anywhere public. It does not modify, replace, or depend on the
existing Rhytara static frontend (`index.html` / `shop.html` / etc. one
level up).

---

## 1. What it does

1. A staff member opens `/admin/dashboard` and fills in: the order number,
   the customer's name and email, the design, and the certificate number to
   issue for that design (e.g. "37" for the 37th Echoes of Earth piece).
2. The system checks that number hasn't already been used **for that
   design** — a duplicate is rejected outright, never silently allowed.
3. It renders a Certificate of Authenticity PDF from
   [`templates/certificate.html`](templates/certificate.html), stores it,
   and generates a download link, which opens automatically in a new tab.
4. The staff member downloads that PDF and sends it to the customer
   themselves (attach it to an email, WhatsApp it, however they normally
   communicate with clients).
5. The dashboard shows every certificate issued — name, design, edition
   number, status — searchable and filterable, with the ability to correct
   a customer's name and regenerate the PDF.

There is a working email-sending subsystem in the code
(`src/services/email/`, including a Gmail provider) that was built earlier
and then deliberately disconnected from the issuance flow at the user's
request — see section 9 if you ever want to turn automatic sending back on.

---

## 2. Architecture

```
Dashboard "Issue certificate" form
        │  POST /admin/dashboard/api/certificates
        ▼
issueCertificate(input)
        │
        ├─► createCertificate()  — INSERT, relying on the database's
        │      UNIQUE (design_code, certificate_number) constraint to
        │      reject a duplicate number for that design outright
        │
        └─► generateAndStoreCertificate()
               ├─ buildCertificateTemplateData()
               ├─ renderCertificatePdf()      (Puppeteer)
               └─ CertificateStorage.upload()  (local, by default)
```

**Duplicate protection** is a single database constraint:
`UNIQUE (design_code, certificate_number)` on the `certificates` table. The
same number can exist once per design (e.g. "037" for both Echoes of Earth
and Grounding Nature), but never twice for the same design — enforced by
Postgres itself, not just application logic, so it holds even under
concurrent requests.

---

## 3. Admin dashboard

A browser dashboard at `/admin/dashboard` (served by this same local
service). It shows:

- **Totals** — how many certificates issued, by status, and a per-design
  breakdown (how many of each design's edition have gone out).
- **Issue a new certificate** — the form described above. Selecting a
  design pre-fills the next unused certificate number for that design as a
  suggestion (highest issued + 1) — you're always free to type a different
  number instead; nothing is auto-generated behind your back.
- **Search/filter** by customer name, email, order number, design, or
  status.
- **Download the PDF** — every row with a generated certificate has a
  Download PDF link.
- **Fix a wrong name** — click *Edit name*, correct it, *Save*, then
  *Regenerate PDF* to get a corrected certificate reflecting the fix.
- **Retry a failed one** — if PDF generation failed (a transient
  render/upload error), the same *Regenerate PDF* button tries again.

It auto-refreshes every 15 seconds so multiple staff members see the same
up-to-date list.

**Access:** open `http://localhost:3000/admin/dashboard`, enter the
`ADMIN_API_TOKEN` value once (stored in that browser's local storage, sent
as the `x-admin-token` header on every API call).

---

## 4. Local setup

Requires Node.js ≥ 18.17 and PostgreSQL.

```bash
cd certificate-automation
npm install
cp .env.example .env
# edit .env — see section 5 below
npm run migrate     # creates the `certificates` table
npm run dev          # starts the service with auto-reload
curl http://localhost:3000/health   # → {"status":"ok"}
```

Puppeteer downloads its own bundled Chromium on `npm install`; no separate
browser install is needed.

### Local Postgres (already set up on this Mac)

This machine had no Postgres or Docker installed, so a real local Postgres
17 was set up without needing Homebrew or admin rights, by extracting
Postgres.app's bundled binaries directly:

- **Binaries:** `~/.local/rhytara-postgres/pg17/bin`
- **Data directory:** `~/.local/rhytara-postgres/data`
- **Port:** `5433` (chosen to avoid clashing with a system-wide Postgres on
  the default 5432)
- **Connection string** (already in `.env`):
  `postgres://rhytara@localhost:5433/rhytara_certificates`

```bash
PG=~/.local/rhytara-postgres/pg17/bin
DATA=~/.local/rhytara-postgres/data

# start
"$PG/pg_ctl" -D "$DATA" -l ~/.local/rhytara-postgres/logfile -o "-p 5433 -k /tmp" start

# stop
"$PG/pg_ctl" -D "$DATA" stop

# status
"$PG/pg_ctl" -D "$DATA" status
```

It needs to be running (`pg_ctl ... start`) before `npm run migrate` or
`npm run dev`/`npm start` will work. It does **not** start automatically on
login — start it manually, or set up a `launchd` agent if you want it
always running.

### Running the dashboard day to day

```bash
cd certificate-automation
~/.local/rhytara-postgres/pg17/bin/pg_ctl -D ~/.local/rhytara-postgres/data -l ~/.local/rhytara-postgres/logfile -o "-p 5433 -k /tmp" start
npm run dev
```

Then open `http://localhost:3000/admin/dashboard` in a browser on this Mac.
Leave the terminal running while you use it; `Ctrl+C` stops the server.

---

## 5. Environment variables

See [`.env.example`](.env.example) for the full, commented list. The ones
that actually matter for the local, PDF-only workflow:

| Variable | Purpose |
|---|---|
| `CERTIFICATE_STORAGE_PROVIDER` | `local` (default, fine for this use case) or `s3` |
| `CERTIFICATE_LINK_SECRET` | Signs local-storage download links |
| `APP_BASE_URL`, `PORT` | This service's own URL and port |
| `DATABASE_URL` | Postgres connection string |
| `ADMIN_API_TOKEN` | Required header value (`x-admin-token`) for `/admin/dashboard/api/*` — also what you type into the dashboard's login screen |

The `EMAIL_*` / `GMAIL_*` variables are only relevant if you turn automatic
sending back on (section 9) — otherwise leave them as-is.

Never commit `.env`. `.env.example` contains no real secrets.

---

## 6. Database setup

Migrations are plain SQL files in [`migrations/`](migrations/), applied in
order and tracked in a `schema_migrations` table:

```bash
npm run migrate
```

Re-running `npm run migrate` is safe — already-applied files are skipped.

The one table, `certificates`, holds every issued (or attempted)
certificate — order number, customer name/email, design, certificate
number, edition size, status, PDF URL, and timestamps. See
[`migrations/001_init.sql`](migrations/001_init.sql) for the full schema.

---

## 7. Certificate template editing

The certificate is the client-supplied design at
[`templates/certificate-background.jpg`](templates/certificate-background.jpg)
— left completely untouched — with exactly three values overlaid on top by
[`templates/certificate.html`](templates/certificate.html) /
[`templates/certificate.css`](templates/certificate.css): the design name
(on the "Title of Artwork" line), the edition number (e.g. "037/250"), and
the customer's name. Nothing else is rendered — no logo, no artwork photo,
no story copy.

To change which three values are shown or where they sit on the page, edit
the `.field-*` rules in `certificate.css` (positions are percentages of the
page, since the background image is a fixed 3:2 design) and the matching
`{{variable}}` in `certificate.html`. Available variables are listed in
[`src/services/certificate/templateData.ts`](src/services/certificate/templateData.ts).
To use a different background image entirely, replace
`certificate-background.jpg` with one of the same aspect ratio and
re-check the field positions.

---

## 8. Design story editing

Edit [`config/designs.json`](config/designs.json) — plain JSON, no code
changes needed. Each key must **exactly match** the design name you type
into the dashboard's "Issue certificate" form (case-insensitive). Fields:

```json
{
  "Echoes of Earth": {
    "collection": "Nature's Rhythm",
    "code": "EOE",
    "editionTotal": 250,
    "story": "The certificate copy for this design."
  }
}
```

- `code` is used as the duplicate-protection key and in generated filenames
  (e.g. `certificates/EOE/...`) — still load-bearing.
- `collection` and `story` are currently unused by the certificate PDF (see
  section 7) but are kept here in case a future design brings them back.
- `editionTotal` is the denominator shown on the certificate (e.g. "037 of
  250") and the default pre-filled on the dashboard form — override it per
  certificate on the form if a particular design's edition size differs.
- Changes are picked up within 60 seconds without restarting the service.

---

## 9. Turning automatic email sending back on

The code for this already exists and was tested working — it's just not
called from the issuance flow anymore. If you want it back:

1. In `src/certificates/issueCertificate.ts`, `issueCertificate()` and
   `regenerateCertificate()` used to also build and send an email after
   generating the PDF — see git history (the commit that added
   `certificate-automation/`) for the exact code, which called
   `buildCertificateEmailHtml()` and `getEmailProvider().send()`.
2. Set `EMAIL_PROVIDER=gmail` (sends via a real Gmail inbox using an App
   Password) or `EMAIL_PROVIDER=resend` (a dedicated transactional
   provider, sends as your own verified domain) in `.env`.
3. For Gmail: set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (a 16-character
   code from https://myaccount.google.com/apppasswords — requires 2-Step
   Verification on that account first).
4. Keep `CERTIFICATE_TEST_MODE=true` and `TEST_EMAIL` set to your own
   address while testing, so nothing goes to a real customer by accident.

---

## 10. Setting this up on your client's Mac

Two scripts in [`scripts/`](scripts/) handle this without needing her to
touch a terminal command by hand:

1. **Get the code onto her Mac.** Easiest way: on her Mac, open
   https://github.com/aashaythakkar2018/Rashmirao, click the green **Code**
   button → **Download ZIP**, then unzip it (double-click the downloaded
   file). Everything you need is in the `certificate-automation` folder
   inside it — the rest of that download is the separate Rhytara website
   and can be ignored.
2. **First-time setup.** Inside `certificate-automation`, open the
   `scripts` folder and double-click **`setup-mac.command`**. A Terminal
   window opens and does everything automatically: installs the local
   database (no admin password needed), installs the project's
   dependencies, and creates a fresh, unique login token. It'll pause and
   ask you to install Node.js first if it isn't already on her Mac (opens
   the official installer — just click through it, then run
   `setup-mac.command` again).
3. **The dashboard login token** is printed clearly at the end of setup —
   write it down or take a screenshot. It's also saved in the new `.env`
   file if you need to find it again later (open it in TextEdit, look for
   `ADMIN_API_TOKEN=`).
4. **Using it day to day.** Double-click **`start.command`** any time she
   wants to open the dashboard — it starts everything and opens the
   dashboard in her browser automatically. Leave that Terminal window open
   while she's using it; closing it (or `Ctrl+C`) stops the service.

Each of you (this Mac and hers) has its own separate local database — the
certificates issued here don't appear on her copy and vice versa. If you
want a single shared list both of you see, that's the hosted-deployment
path from earlier, which you asked to hold off on for now.

Both scripts are safe to run more than once — every step skips itself if
it's already done, so re-running `setup-mac.command` after an interruption
(e.g. she had to install Node.js first) just picks up where it left off.

---

## 11. Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Certificate number N has already been issued for X" | Someone already issued that exact number for that design. Search the dashboard for it — if it's a genuine mistake, edit/regenerate that one instead of creating a second. |
| PDF looks wrong / text lands in the wrong spot | The three overlaid fields are positioned by percentage in `certificate.css` — see section 7. |
| Dashboard shows "Unauthorized" | Wrong `x-admin-token` — check for typos when copying `ADMIN_API_TOKEN` out of `.env`. |
| Dashboard won't load at all | Is the local Postgres running (`pg_ctl ... status`)? Is `npm run dev` still running in a terminal? |

---

## 12. What's still a placeholder

Nothing — the certificate design is the client-supplied background image,
and all three fields it needs (design name, edition number, customer name)
come straight from the `certificates` row.

`assets/logo/`, `assets/signature/`, `assets/artwork/`, and the `story`
field in `config/designs.json` are no longer used by the certificate PDF
(the earlier, richer template that read them was replaced — see section 7)
but are left in place in case a future design wants them back.
