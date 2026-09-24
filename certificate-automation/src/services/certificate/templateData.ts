import path from 'path';
import { paths } from '../../config/env';
import { assetToDataUri } from '../../utils/dataUri';
import { Certificate } from '../../db/certificates';

export interface CertificateTemplateData {
  background_url: string;
  design_name: string;
  customer_full_name: string;
  edition_number: string; // formatted "037/250"
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
 *
 * The certificate itself is the client-supplied background image
 * (templates/certificate-background.jpg, untouched) with exactly three
 * values overlaid on top: design name, edition number, and the customer's
 * name - nothing else.
 */
export function buildCertificateTemplateData(cert: Certificate): CertificateTemplateData {
  const customerName =
    [cert.customer_first_name, cert.customer_last_name].filter(Boolean).join(' ').trim() ||
    'Valued Collector';

  return {
    background_url: assetToDataUri(path.join(paths.templates, 'certificate-background.jpg')),
    design_name: cert.design_name,
    customer_full_name: customerName,
    edition_number: formatEditionNumber(cert.certificate_number, cert.edition_total),
  };
}
