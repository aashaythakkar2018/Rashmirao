import { Router } from 'express';
import { getCertificatesByEmail } from '../db/certificates';
import { formatEditionNumber } from '../services/certificate/templateData';

export const customerRouter = Router();

/**
 * GET /customer/certificates?email=...
 *
 * Extensibility point for a future authenticated Rhytara customer account
 * page - not built out yet. Currently unauthenticated beyond requiring the
 * exact email; DO NOT expose this publicly without adding real customer
 * auth (a session, a signed link, etc.) in front of it first.
 */
customerRouter.get('/certificates', async (req, res) => {
  const email = String(req.query.email || '');
  if (!email) return res.status(400).json({ error: 'email query param is required' });

  const certs = await getCertificatesByEmail(email);
  res.json({
    certificates: certs.map((c) => ({
      orderNumber: c.order_number,
      designName: c.design_name,
      editionNumber: formatEditionNumber(c.certificate_number, c.edition_total),
      certificateUrl: c.certificate_url,
      issuedAt: c.sent_at,
    })),
  });
});
