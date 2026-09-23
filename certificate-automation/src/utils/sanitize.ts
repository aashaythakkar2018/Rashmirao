/**
 * Turns arbitrary Shopify-supplied strings (order names contain "#", SKUs can
 * contain punctuation) into a safe filesystem/URL-safe filename component.
 *
 * "#1001" + "RHY-EOE-2024-44" -> "Rhytara_Certificate_1001_RHY-EOE-2024-44.pdf"
 */
export function sanitizeFilenamePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9-_]+/g, '') // drop #, spaces, slashes, etc.
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export function buildCertificateFilename(orderNumber: string, sku: string): string {
  const safeOrder = sanitizeFilenamePart(orderNumber) || 'order';
  const safeSku = sanitizeFilenamePart(sku) || 'sku';
  return `Rhytara_Certificate_${safeOrder}_${safeSku}.pdf`;
}
