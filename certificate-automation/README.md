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
  the customer's name and email, the design, and the **complete SKU of the
  physical saree** (e.g. `RHY-EOE-GRS-002/250`). For configured SKU prefixes,
  the dashboard suggests the next number from the highest recorded
  certificate or known sold SKU; the staff member confirms it against the
  physical label. The complete SKU remains editable.
2. The edition number is read from the submitted SKU — the server never
  renumbers it. It checks the SKU belongs to the chosen design, and
   that neither that SKU nor that edition of the design has already been
   certified — a duplicate is rejected outright, never silently allowed.
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
- **Issue a new certificate** — the form described above. Typing a SKU
  whose design code is known (EOE, PPR, SGL) selects the design for you.
- **Search/filter** by customer name, email, order number, design, SKU, or
  status.
- **Preview or download the PDF** — every row with a generated certificate
  has a *Preview PDF* link, which opens it in a new browser tab (Chrome's
  built-in PDF viewer), and a *Download* link that saves it straight to
  the Downloads folder.
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
certificate — order number, customer name/email, design, SKU, edition
number and size (parsed from the SKU), status, PDF URL, and timestamps. See
[`migrations/`](migrations/) for the full schema. `sku` is unique, and is
empty only on certificates issued before SKUs were recorded.

---

## 7. Certificate template editing

The certificate is an A4 landscape page built from
[`templates/certificate.html`](templates/certificate.html) /
[`templates/certificate.css`](templates/certificate.css). It keeps the look
of the client-supplied design
([`templates/certificate-background.jpg`](templates/certificate-background.jpg)):
its cream paper, bronze border, and the corner and crown flourishes cut out
of it as `ornament-corner.png` / `ornament-crown.png`. It shows:

- Rhytara logo (`assets/logo/rhytara-logo.png`) and the collection name
- Title of artwork, with its image (`assets/artwork/{code}.jpg`)
- Edition number / 250, and the exact SKU
- Artist (Rashmi Rao), medium, and provenance
- Who it was issued to, order number, and date of issue (the day the
  certificate was first issued — regenerating keeps the same date)
- Artist signature, and an edition seal

**Signature:** save Rashmi's signature as
`assets/signature/rashmi-rao-signature.png` (dark ink on a transparent
background) and it appears above the signature line on every certificate
generated or regenerated after that. Until then the line is left blank for
a hand signature — a signature is never fabricated.

The medium and provenance wording live in
[`src/services/certificate/templateData.ts`](src/services/certificate/templateData.ts)
(`MEDIUM`, and `origin`), along with every `{{variable}}` the template can
use. All text values are HTML-escaped before they reach the template.

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
    "skuCode": "EOE",
    "editionTotal": 250,
    "story": "The story copy for this design."
  }
}
```

- `code` is the internal key used for duplicate protection, the artwork
  file name, and storage folders (e.g. `certificates/EOE/...`).
- `skuCode` is the design segment of this design's SKUs (`SGL` in
  `RHY-SGL-GRS-001/250`). A SKU for a design with a `skuCode` must use it.
  **Grounding Nature and Magical Pansies don't have one yet** — add theirs
  once Rashmi confirms them; until then any unclaimed code is accepted for
  those two.
- `collection` is printed on the certificate ("Nature's Rhythm Collection").
- `editionTotal` must match the `/250` in the SKU.
- `story` is not printed on the certificate.
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
| "Edition N has already been issued for X" / "A certificate has already been issued for SKU …" | That piece is already certified. Search the dashboard for the SKU — correct and regenerate that one instead of creating a second. |
| "… is not a Rhytara SKU" / "should be zero-padded" | Type the SKU exactly as on the piece, e.g. `RHY-EOE-GRS-001/250`. |
| "SKU … belongs to X, not Y" | The design picked on the form doesn't match the SKU's design code. |
| Dashboard shows "Unauthorized" | Wrong `x-admin-token` — check for typos when copying `ADMIN_API_TOKEN` out of `.env`. |
| Dashboard won't load at all | Is the local Postgres running (`pg_ctl ... status`)? Is `npm run dev` still running in a terminal? |

---

## 12. What's still a placeholder

- **Rashmi's signature** — see section 7. The signature line prints blank
  until `assets/signature/rashmi-rao-signature.png` is added.
- **SKU codes for Grounding Nature and Magical Pansies** — see section 8.
