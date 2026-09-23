-- Rhytara Certificate of Authenticity — manual issuance schema
--
-- This system has no Shopify integration. Every certificate is created by
-- a staff member typing in an order number, a customer name/email, a
-- design, and the certificate number to issue for that design. There is no
-- automatic trigger and no external source of truth to reconcile against.

CREATE TABLE IF NOT EXISTS certificates (
  id                    BIGSERIAL PRIMARY KEY,

  order_number          TEXT NOT NULL,
  customer_first_name   TEXT NOT NULL,
  customer_last_name    TEXT,
  customer_email        TEXT NOT NULL,

  design_name           TEXT NOT NULL,   -- must match a key in config/designs.json
  design_code           TEXT NOT NULL,   -- that design's `code`, denormalized for fast lookups

  certificate_number    INTEGER NOT NULL,   -- the raw number, e.g. 37
  edition_total          INTEGER NOT NULL DEFAULT 250,   -- the denominator, e.g. 250 ("037/250")

  certificate_url       TEXT,
  storage_key           TEXT,

  status                TEXT NOT NULL DEFAULT 'pending',
  -- status: pending | processing | generated | emailed | failed
  attempt_count         INTEGER NOT NULL DEFAULT 0,
  error_message         TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at               TIMESTAMPTZ,

  -- The core business rule: a given certificate number can only ever be
  -- issued once per design (e.g. "037" for Echoes of Earth and "037" for
  -- Grounding Nature are both fine — they're different editions — but
  -- "037" for Echoes of Earth twice is a mistake and must be rejected).
  UNIQUE (design_code, certificate_number)
);

CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates (status);
CREATE INDEX IF NOT EXISTS idx_certificates_order ON certificates (order_number);
CREATE INDEX IF NOT EXISTS idx_certificates_email ON certificates (customer_email);
CREATE INDEX IF NOT EXISTS idx_certificates_design ON certificates (design_code);
