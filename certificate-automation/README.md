# Rhytara — Certificate of Authenticity System

A small backend + dashboard for manually issuing Certificate of Authenticity
PDFs and emailing them to customers. There is **no Shopify integration** —
every certificate is created by a staff member typing in the details on the
dashboard.

This is a **separate backend service**. It does not modify, replace, or
depend on the existing Rhytara static frontend (`index.html` / `shop.html` /
etc. one level up).

---

## 1. What it does

1. A staff member opens `/admin/dashboard` and fills in: the order number,
   the customer's name and email, the design, and the certificate number to
   issue for that design (e.g. "37" for the 37th Echoes of Earth piece).
2. The system checks that number hasn't already been used **for that
   design** — a duplicate is rejected outright, never silently allowed.
3. It renders a Certificate of Authenticity PDF from
   [`templates/certificate.html`](templates/certificate.html), stores it,
   and generates a secure download URL.
4. It emails the customer a proper thank-you note with a download button
   for their certificate.
5. The dashboard shows every certificate issued — name, design, edition
   number, status — searchable and filterable, with the ability to correct
   a customer's name and resend, or retry one that failed.

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
        ├─► generateAndStoreCertificate()
        │      ├─ buildCertificateTemplateData()
        │      ├─ renderCertificatePdf()      (Puppeteer)
        │      └─ CertificateStorage.upload()  (S3 or local)
        │
        └─► EmailProvider.send()  →  markEmailed()
```

**Duplicate protection** is a single database constraint:
`UNIQUE (design_code, certificate_number)` on the `certificates` table. The
same number can exist once per design (e.g. "037" for both Echoes of Earth
and Grounding Nature), but never twice for the same design — enforced by
Postgres itself, not just application logic, so it holds even under
concurrent requests.

**Replaceable pieces**, each behind a small interface so swapping providers
is a config change, not a rewrite:
- `services/storage/CertificateStorage.ts` — `LocalCertificateStorage` (dev)
  or `S3CertificateStorage` (production, any S3-compatible provider).
- `services/email/EmailProvider.ts` — `ConsoleEmailProvider` (dev, just logs)
  or `ResendEmailProvider` (production).

---

## 3. Admin dashboard

A browser dashboard at `/admin/dashboard` (served by this same service — no
separate deploy). It shows:

- **Totals** — how many certificates issued, by status, and a per-design
  breakdown (how many of each design's edition have gone out).
- **Issue a new certificate** — the form described above. Selecting a
  design pre-fills the next unused certificate number for that design as a
  suggestion (highest issued + 1) — you're always free to type a different
  number instead; nothing is auto-generated behind your back.
- **Search/filter** by customer name, email, order number, design, or
  status.
- **Fix a wrong name and resend** — click *Edit name*, correct it, *Save*,
  then *Resend*. Resend regenerates the certificate PDF from the corrected
  data and emails it immediately.
- **Retry a failed one** — if generation or sending failed (a transient
  render/upload/email error), the same *Resend* button tries again with
  the same stored data.

It auto-refreshes every 15 seconds so multiple staff members see the same
up-to-date list.

**Access:** open `https://YOUR_BACKEND_DOMAIN/admin/dashboard`, enter the
`ADMIN_API_TOKEN` value once (stored in that browser's local storage, sent
as the `x-admin-token` header on every API call). The dashboard page itself
has no login wall — anyone with the URL can see the empty shell — but no
data loads and no action works without the correct token. Put this behind
your host's IP allowlist or basic auth if it needs to be off-limits to more
than "anyone who knows the URL and the token."

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
always running. This is a fine setup for local development; for production,
use a managed Postgres (RDS, Neon, Supabase, Railway Postgres, etc.).

---

## 5. Environment variables

See [`.env.example`](.env.example) for the full, commented list. Summary:

| Variable | Purpose |
|---|---|
| `EMAIL_PROVIDER` | `resend` or `console` |
| `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_API_KEY` | Transactional email config — set `EMAIL_FROM` to your real business email once a provider is configured |
| `CERTIFICATE_STORAGE_PROVIDER` | `s3` or `local` |
| `CERTIFICATE_STORAGE_*` | Bucket/region/credentials/endpoint for `s3` |
| `CERTIFICATE_LINK_SECRET` | Signs local-storage download links (`local` provider only) |
| `APP_BASE_URL`, `PORT` | This service's own URL and port |
| `DATABASE_URL` | Postgres connection string |
| `CERTIFICATE_TEST_MODE` | `true` routes every email to `TEST_EMAIL` instead of the real customer |
| `TEST_EMAIL` | Recipient used while `CERTIFICATE_TEST_MODE=true` |
| `ADMIN_API_TOKEN` | Required header value (`x-admin-token`) for `/admin/dashboard/api/*` — also what you type into the dashboard's login screen |

Never commit `.env`. `.env.example` contains no real secrets.

---

## 6. Database setup

Migrations are plain SQL files in [`migrations/`](migrations/), applied in
order and tracked in a `schema_migrations` table:

```bash
npm run migrate
```

Re-running `npm run migrate` is safe — already-applied files are skipped.
Add new migrations as `002_*.sql`, `003_*.sql`, etc.

The one table, `certificates`, holds every issued (or attempted)
certificate — order number, customer name/email, design, certificate
number, edition size, status, PDF URL, and timestamps. See
[`migrations/001_init.sql`](migrations/001_init.sql) for the full schema
and the reasoning behind the unique constraint.

---

## 7. Certificate template editing

Edit [`templates/certificate.html`](templates/certificate.html) (structure)
and [`templates/certificate.css`](templates/certificate.css) (styling) —
both are plain HTML/CSS with `{{variable}}` placeholders, no build step.
Available variables are listed in
[`src/services/certificate/templateData.ts`](src/services/certificate/templateData.ts).

Brand assets go in `assets/logo/`, `assets/signature/`, `assets/artwork/`
(see the `README.md` in each folder for exact filenames expected). Until
real assets are added, the certificate renders correctly with those slots
blank — nothing breaks.

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
    "story": "The certificate/email copy for this design."
  }
}
```

- `code` is used to look up `assets/artwork/{code}.jpg`, as the duplicate-
  protection key, and in generated filenames.
- `editionTotal` is the denominator shown on the certificate (e.g. "037 of
  250") and the default pre-filled on the dashboard form — override it per
  certificate on the form if a particular design's edition size differs.
- Changes are picked up within 60 seconds without restarting the service
  (the file is re-read periodically, not cached forever).

---

## 9. Email configuration

Set `EMAIL_PROVIDER=resend` and `EMAIL_API_KEY` to your Resend API key for
production, and `EMAIL_FROM` to your real business email address (once its
sending domain is verified with the provider). `EMAIL_PROVIDER=console`
(the default) logs the email instead of sending anything — useful for local
development without a real provider.

To use a different provider (SendGrid, Postmark, SES, etc.), implement
`EmailProvider` (`src/services/email/EmailProvider.ts`) the same way
`ResendEmailProvider` does, add it to the switch in
`src/services/email/index.ts`, and point `EMAIL_PROVIDER` at it.

The email body template — a proper thank-you note, not just a receipt — is
[`templates/email.html`](templates/email.html).

---

## 10. Test mode

```
CERTIFICATE_TEST_MODE=true
TEST_EMAIL=you@example.com
```

While `true`: certificates are generated and stored for real, and the
certificate URL is logged, but the email always goes to `TEST_EMAIL`
instead of the real customer — regardless of what was typed into the form.

Set `CERTIFICATE_TEST_MODE=false` to email real customers.

---

## 11. Production deployment

This is a standard Node.js HTTP service — it runs on any common Node
hosting environment (Render, Railway, Fly.io, a VM behind nginx, ECS/Fargate,
etc.). It does **not** require Vercel/Netlify (Puppeteer's headless
Chromium is not a good fit for typical serverless function limits).

```bash
npm install
npm run build       # compiles TypeScript → dist/
npm run migrate      # apply migrations against the production DATABASE_URL
npm start             # runs dist/src/index.js
```

Checklist:
- [ ] `DATABASE_URL` points at a real Postgres instance (managed Postgres —
      RDS, Neon, Supabase, Railway Postgres, etc. — all work).
- [ ] `CERTIFICATE_STORAGE_PROVIDER=s3`, bucket is **private**, credentials
      set. Never use `local` storage in production — it isn't durable
      across deploys/restarts on most hosts.
- [ ] `EMAIL_PROVIDER=resend` (or your chosen provider), `EMAIL_API_KEY` set,
      `EMAIL_FROM` is your real business address, sending domain verified.
- [ ] `CERTIFICATE_TEST_MODE=false`.
- [ ] `APP_BASE_URL` is this service's real public HTTPS URL.
- [ ] `ADMIN_API_TOKEN` is a long random value — this is the password for
      the dashboard, which can edit and resend every certificate.

---

## 12. Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Certificate number N has already been issued for X" | Someone already issued that exact number for that design. Check the dashboard's search for it — if it's a genuine mistake on the existing one, edit/resend that one instead of trying to create a second. |
| Certificate generated but no email received | Check `CERTIFICATE_TEST_MODE` — if `true`, the email went to `TEST_EMAIL`, not the customer. |
| PDF looks wrong / missing images | Brand assets not yet added under `assets/` — see section 7. Missing images render as blank, not an error. |
| Dashboard shows "Unauthorized" | Wrong `x-admin-token` — check for typos when copying `ADMIN_API_TOKEN` out of `.env`. |
| `/admin/dashboard/api/*` returns 503 | `ADMIN_API_TOKEN` isn't set in the environment — the API refuses to run without it. |

---

## 13. Design decisions worth knowing about

- **No Shopify integration.** An earlier version of this system read order
  data from Shopify via webhooks; that entire integration was removed in
  favor of manual entry, since the actual business need was a simple,
  fully-controlled issuance workflow, not automation tied to checkout.
- **Duplicate protection is a database constraint, not just a check in
  code** — `UNIQUE (design_code, certificate_number)` — so it holds even
  under concurrent requests, not just in the common case.
- **Certificate numbers are never auto-assigned.** The dashboard suggests
  the next unused number per design, but the field is always editable —
  staff have full control, per the original requirement.

---

## 14. What's still a placeholder

These are intentionally not invented and must be supplied before going
live:

- `config/designs.json` → each design's real `story` text.
- `assets/logo/` → the Rhytara logo.
- `assets/signature/` → Rashmi Rao's signature.
- `assets/artwork/` → one image per design.

None of these require touching application code — drop the files in and
edit the JSON.
