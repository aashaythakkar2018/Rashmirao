-- The physical saree's SKU, exactly as Rashmi assigns it, e.g.
-- "RHY-EOE-GRS-001/250". It carries the authoritative edition number:
-- certificate_number / edition_total are parsed from it, never generated.
--
-- Nullable only so certificates issued before SKUs were recorded keep
-- working; every new certificate requires one (enforced by the API).

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS sku TEXT;

-- One certificate per physical piece.
CREATE UNIQUE INDEX IF NOT EXISTS certificates_sku_key ON certificates (sku) WHERE sku IS NOT NULL;
