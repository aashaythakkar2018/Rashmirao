import path from 'path';
import { paths } from '../../config/env';
import { findDesignForProductTitle } from '../../config/designs';
import { assetToDataUri } from '../../utils/dataUri';
import { Certificate } from '../../db/certificates';

export interface CertificateTemplateData {
  logo_url: string;
  signature_url: string;
  artwork_image_url: string;
  collection_name: string;
  design_name: string;
  artist_name: string;
  customer_full_name: string;
  edition_number: string; // formatted "037/250"
  order_number: string;
  artwork_story: string;
  issue_date: string;
}

const ARTIST_NAME = 'Rashmi Rao';

function formatIssueDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** "37" + 250 -> "037/250" (zero-padded to the digit width of the edition total). */
export function formatEditionNumber(certificateNumber: number, editionTotal: number): string {
  const width = String(editionTotal).length;
  return `${String(certificateNumber).padStart(width, '0')}/${editionTotal}`;
}

/**
 * Builds the exact data that goes on the printed certificate, straight from
 * the certificates row - the number a staff member typed in is never
 * recomputed or altered here.
 */
export function buildCertificateTemplateData(cert: Certificate): CertificateTemplateData {
  const design = findDesignForProductTitle(cert.design_name);
  const code = design?.code ?? cert.design_code ?? 'default';

  const customerName =
    [cert.customer_first_name, cert.customer_last_name].filter(Boolean).join(' ').trim() ||
    'Valued Collector';

  return {
    logo_url: assetToDataUri(path.join(paths.assets, 'logo', 'rhytara-logo.png')),
    signature_url: assetToDataUri(path.join(paths.assets, 'signature', 'rashmi-rao-signature.png')),
    artwork_image_url: assetToDataUri(path.join(paths.assets, 'artwork', `${code}.jpg`)),
    collection_name: design?.collection ?? "Nature's Rhythm",
    design_name: cert.design_name,
    artist_name: ARTIST_NAME,
    customer_full_name: customerName,
    edition_number: formatEditionNumber(cert.certificate_number, cert.edition_total),
    order_number: cert.order_number,
    artwork_story: design?.story ?? '',
    issue_date: formatIssueDate(new Date()),
  };
}
