import { Certificate, markGenerated } from '../../db/certificates';
import { buildCertificateTemplateData, formatEditionNumber } from './templateData';
import { renderCertificatePdf } from './renderPdf';
import { getCertificateStorage } from '../storage';
import { buildCertificateFilename } from '../../utils/sanitize';
import { withRetry } from '../../utils/retry';
import { logger } from '../../utils/logger';

/**
 * Renders the PDF, uploads it, marks the certificate 'generated', and
 * returns the secure URL. Wrapped in retry so a transient render/upload
 * failure doesn't fail the whole issuance on the first hiccup.
 */
export async function generateAndStoreCertificate(
  cert: Certificate
): Promise<{ certificateUrl: string; storageKey: string }> {
  const templateData = buildCertificateTemplateData(cert);

  const pdfBuffer = await withRetry(() => renderCertificatePdf(templateData), {
    label: `render PDF for certificate ${cert.id}`,
    attempts: 3,
  });

  const editionRef = formatEditionNumber(cert.certificate_number, cert.edition_total).replace('/', '-of-');
  const filename = buildCertificateFilename(cert.order_number, `${cert.design_code}-${editionRef}`);
  const key = `certificates/${cert.design_code}/${filename}`;

  const storage = getCertificateStorage();
  const { storageKey } = await withRetry(
    () => storage.uploadCertificate({ key, buffer: pdfBuffer, contentType: 'application/pdf' }),
    { label: `upload certificate ${cert.id}`, attempts: 3 }
  );

  const certificateUrl = await storage.getCertificateUrl(storageKey);

  await markGenerated(cert.id, certificateUrl, storageKey);
  logger.info('Certificate generated and stored', { certificateId: cert.id, storageKey });

  return { certificateUrl, storageKey };
}
