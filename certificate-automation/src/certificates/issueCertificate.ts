import {
  Certificate,
  createCertificate,
  getCertificateById,
  markProcessing,
  markFailed,
  DuplicateCertificateNumberError,
} from '../db/certificates';
import { generateAndStoreCertificate } from '../services/certificate/generateCertificate';
import { withRetry } from '../utils/retry';
import { logger } from '../utils/logger';

export { DuplicateCertificateNumberError };

export interface IssueCertificateInput {
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string | null;
  customerEmail: string;
  designName: string;
  designCode: string;
  certificateNumber: number;
  editionTotal: number;
}

/**
 * The manual issuance flow: create the row (rejecting a duplicate
 * certificate number for this design), render the PDF, and store it.
 * Stops there - this system does not send email itself. The staff member
 * downloads the PDF from the dashboard and attaches/sends it themselves
 * (e.g. from their own Gmail), by design.
 *
 * Throws DuplicateCertificateNumberError if that number was already used
 * for this design - the caller (the dashboard API) turns that into a 409.
 */
export async function issueCertificate(input: IssueCertificateInput): Promise<Certificate> {
  const cert = await createCertificate({
    order_number: input.orderNumber,
    customer_first_name: input.customerFirstName,
    customer_last_name: input.customerLastName,
    customer_email: input.customerEmail,
    design_name: input.designName,
    design_code: input.designCode,
    certificate_number: input.certificateNumber,
    edition_total: input.editionTotal,
  });

  try {
    await markProcessing(cert.id);
    await withRetry(() => generateAndStoreCertificate(cert), {
      label: `generate certificate ${cert.id}`,
      attempts: 3,
    });

    logger.info('Certificate issued', {
      certificateId: cert.id,
      design: input.designName,
      number: input.certificateNumber,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(cert.id, message);
    logger.error('Certificate issuance failed', { certificateId: cert.id, error: message });
  }

  return (await getCertificateById(cert.id))!;
}

/**
 * Regenerates the PDF from this row's CURRENT data - used after correcting
 * a customer's name (or to retry one that failed to generate). Does not
 * send anything; the staff member re-downloads and re-sends themselves.
 */
export async function regenerateCertificate(id: number): Promise<Certificate> {
  const cert = await getCertificateById(id);
  if (!cert) throw new Error('Certificate not found');

  await markProcessing(cert.id);
  await generateAndStoreCertificate(cert);

  const refreshed = await getCertificateById(cert.id);
  if (!refreshed) throw new Error('Certificate disappeared during regeneration');

  logger.info('Certificate regenerated', { certificateId: refreshed.id });

  return refreshed;
}
