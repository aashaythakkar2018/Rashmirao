import path from 'path';
import { paths } from '../../config/env';
import { findDesignForProductTitle } from '../../config/designs';
import { assetToDataUri } from '../../utils/dataUri';
import { Certificate } from '../../db/certificates';

export interface CertificateTemplateData {
  logo_url: string;
  crown_url: string;
  corner_url: string;
  artwork_image_url: string;
  signature_url: string;
  collection_name: string;
  design_name: string;
  edition_number: string; // formatted "001/250"
  edition_total: string;
  sku: string;
  sku_row_class: string; // hides the SKU row on certificates issued before SKUs were recorded
  artist_name: string;
  medium: string;
  origin: string;
  customer_full_name: string;
  order_number: string;
  issue_date: string;
}

const ARTIST_NAME = 'Rashmi Rao';
const MEDIUM = 'Limited-edition wearable art saree, georgette satin';

/** "37" + 250 -> "037/250" (zero-padded to the digit width of the edition total). */
export function formatEditionNumber(certificateNumber: number, editionTotal: number): string {
  const width = String(editionTotal).length;
  return `${String(certificateNumber).padStart(width, '0')}/${editionTotal}`;
}

export function formatIssueDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the exact data that goes on the printed certificate, straight from
 * the certificates row - the SKU and edition number a staff member entered
 * are never recomputed or altered here. Every text value is HTML-escaped,
 * since customer names are typed in by hand.
 *
 * The date of issue is the day the certificate was first issued, so
 * regenerating a PDF (e.g. after a name correction) keeps the same date.
 */
export function buildCertificateTemplateData(cert: Certificate): CertificateTemplateData {
  const design = findDesignForProductTitle(cert.design_name);
  const code = design?.code ?? cert.design_code;
  const collection = design?.collection ?? "Nature's Rhythm";

  const customerName =
    [cert.customer_first_name, cert.customer_last_name].filter(Boolean).join(' ').trim() ||
    'Valued Collector';

  const text = {
    collection_name: `${collection} Collection`,
    design_name: cert.design_name,
    edition_number: formatEditionNumber(cert.certificate_number, cert.edition_total),
    edition_total: String(cert.edition_total),
    sku: cert.sku ?? '',
    artist_name: ARTIST_NAME,
    medium: MEDIUM,
    origin: `From ${ARTIST_NAME}'s original artwork, ${collection} solo exhibition`,
    customer_full_name: customerName,
    order_number: cert.order_number,
    issue_date: formatIssueDate(new Date(cert.created_at)),
  };
  const escaped = Object.fromEntries(
    Object.entries(text).map(([key, value]) => [key, escapeHtml(value)])
  ) as typeof text;

  return {
    ...escaped,
    sku_row_class: cert.sku ? '' : 'is-hidden',
    logo_url: assetToDataUri(path.join(paths.assets, 'logo', 'rhytara-logo.png')),
    crown_url: assetToDataUri(path.join(paths.templates, 'ornament-crown.png')),
    corner_url: assetToDataUri(path.join(paths.templates, 'ornament-corner.png')),
    artwork_image_url: assetToDataUri(path.join(paths.assets, 'artwork', `${code}.jpg`)),
    // Until Rashmi's signature file is added, the signature line prints blank
    // for a hand signature - a signature is never fabricated.
    signature_url: assetToDataUri(path.join(paths.assets, 'signature', 'rashmi-rao-signature.png')),
  };
}
