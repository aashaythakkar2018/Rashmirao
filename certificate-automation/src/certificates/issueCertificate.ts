import { env } from '../config/env';
import {
  Certificate,
  createCertificate,
  getCertificateById,
  markProcessing,
  markGenerated,
  markEmailed,
  markFailed,
  DuplicateCertificateNumberError,
} from '../db/certificates';
import { generateAndStoreCertificate } from '../services/certificate/generateCertificate';
import { buildCertificateEmailHtml } from '../services/email/buildCertificateEmail';
import { getEmailProvider } from '../services/email';
import { withRetry } from '../utils/retry';
import { logger, maskEmail } from '../utils/logger';

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
 * The entire manual issuance flow: create the row (rejecting a duplicate
 * certificate number for this design), render the PDF, store it, and email
 * it. Runs synchronously within the request - there's no external system
 * to wait on anymore, and the whole thing takes a few seconds, which is
 * fine for a staff member clicking "Issue certificate" once.
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

    const generated = await getCertificateById(cert.id);
    if (!generated) throw new Error('Certificate disappeared during generation');

    const recipient = env.CERTIFICATE_TEST_MODE ? env.TEST_EMAIL : generated.customer_email;
    if (!recipient) {
      throw new Error(
        env.CERTIFICATE_TEST_MODE
          ? 'CERTIFICATE_TEST_MODE is on but TEST_EMAIL is not set.'
          : 'No customer email on file.'
      );
    }

    const { subject, html } = buildCertificateEmailHtml(generated);
    await withRetry(() => getEmailProvider().send({ to: recipient, subject, html }), {
      label: `send certificate email ${cert.id}`,
      attempts: 3,
    });
    await markEmailed(cert.id);

    logger.info('Certificate issued and emailed', {
      certificateId: cert.id,
      design: input.designName,
      number: input.certificateNumber,
      recipient: maskEmail(recipient),
      testMode: env.CERTIFICATE_TEST_MODE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(cert.id, message);
    logger.error('Certificate issuance failed', { certificateId: cert.id, error: message });
  }

  return (await getCertificateById(cert.id))!;
}

/**
 * Regenerates the PDF from this row's CURRENT data (so a name correction
 * takes effect) and re-sends the email. Used both for "Resend" on an
 * already-emailed certificate and to retry one stuck at 'failed' - there's
 * no external system to re-sync from, so both cases are the same action:
 * try again with what's already on file.
 */
export async function resendCertificate(id: number): Promise<Certificate> {
  const cert = await getCertificateById(id);
  if (!cert) throw new Error('Certificate not found');

  await markProcessing(cert.id);
  await generateAndStoreCertificate(cert);

  const refreshed = await getCertificateById(cert.id);
  if (!refreshed) throw new Error('Certificate disappeared during regeneration');

  const recipient = env.CERTIFICATE_TEST_MODE ? env.TEST_EMAIL : refreshed.customer_email;
  if (!recipient) {
    throw new Error(
      env.CERTIFICATE_TEST_MODE
        ? 'CERTIFICATE_TEST_MODE is on but TEST_EMAIL is not set.'
        : 'No customer email on file.'
    );
  }

  const { subject, html } = buildCertificateEmailHtml(refreshed);
  await getEmailProvider().send({ to: recipient, subject, html });
  await markEmailed(refreshed.id);

  logger.info('Certificate resent', {
    certificateId: refreshed.id,
    recipient: maskEmail(recipient),
    testMode: env.CERTIFICATE_TEST_MODE,
  });

  return (await getCertificateById(refreshed.id))!;
}
