import { Router } from 'express';
import { z } from 'zod';
import { requireAdminToken } from './adminAuth';
import {
  listCertificates,
  getCertificateStats,
  updateCertificateCustomerName,
  getCertificateById,
  getNextSuggestedNumber,
} from '../db/certificates';
import {
  issueCertificate,
  resendCertificate,
  DuplicateCertificateNumberError,
} from '../certificates/issueCertificate';
import { loadDesigns, findDesignForProductTitle } from '../config/designs';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const dashboardApiRouter = Router();
dashboardApiRouter.use(requireAdminToken);

/** GET /admin/dashboard/api/meta - tells the UI whether it's pointed at test or live sends. */
dashboardApiRouter.get('/meta', (_req, res) => {
  res.json({
    testMode: env.CERTIFICATE_TEST_MODE,
    testEmail: env.CERTIFICATE_TEST_MODE ? env.TEST_EMAIL ?? null : null,
  });
});

/** GET /admin/dashboard/api/designs - the "Issue certificate" form's design dropdown. */
dashboardApiRouter.get('/designs', async (_req, res) => {
  const designs = loadDesigns();
  const withSuggestions = await Promise.all(
    Object.entries(designs).map(async ([name, d]) => ({
      name,
      code: d.code,
      collection: d.collection,
      editionTotal: d.editionTotal,
      nextSuggestedNumber: await getNextSuggestedNumber(d.code),
    }))
  );
  res.json({ designs: withSuggestions });
});

/** GET /admin/dashboard/api/stats */
dashboardApiRouter.get('/stats', async (_req, res) => {
  const designs = loadDesigns();
  const editionTotals: Record<string, number> = {};
  for (const d of Object.values(designs)) editionTotals[d.code] = d.editionTotal;

  const stats = await getCertificateStats(editionTotals);
  res.json(stats);
});

const ListQuery = z.object({
  status: z.string().optional(),
  design: z.string().optional(), // design code
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(25),
});

/** GET /admin/dashboard/api/certificates?status=&design=&search=&page=&pageSize= */
dashboardApiRouter.get('/certificates', async (req, res) => {
  const parsed = ListQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query parameters', issues: parsed.error.issues });
  }
  const { status, design, search, page, pageSize } = parsed.data;
  const result = await listCertificates({
    status: status as any,
    designCode: design,
    search,
    page,
    pageSize,
  });
  res.json({ rows: result.rows, total: result.total, page, pageSize });
});

const IssueCertificateBody = z.object({
  orderNumber: z.string().trim().min(1, 'Order number is required'),
  customerFirstName: z.string().trim().min(1, 'First name is required'),
  customerLastName: z.string().trim().optional().default(''),
  customerEmail: z.string().trim().email('A valid customer email is required'),
  designName: z.string().trim().min(1, 'Design is required'),
  certificateNumber: z.coerce.number().int().positive('Certificate number must be a positive number'),
  editionTotal: z.coerce.number().int().positive().optional(),
});

/**
 * POST /admin/dashboard/api/certificates
 * Issues a brand-new certificate: validates the design exists, checks the
 * certificate number isn't already used for that design, generates the
 * PDF, stores it, and emails it - all in this one request.
 */
dashboardApiRouter.post('/certificates', async (req, res) => {
  const parsed = IssueCertificateBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues });
  }
  const input = parsed.data;

  const design = findDesignForProductTitle(input.designName);
  if (!design) {
    return res.status(400).json({
      error: `"${input.designName}" is not a design configured in config/designs.json.`,
    });
  }

  try {
    const cert = await issueCertificate({
      orderNumber: input.orderNumber,
      customerFirstName: input.customerFirstName,
      customerLastName: input.customerLastName || null,
      customerEmail: input.customerEmail,
      designName: input.designName,
      designCode: design.code,
      certificateNumber: input.certificateNumber,
      editionTotal: input.editionTotal ?? design.editionTotal,
    });

    if (cert.status === 'failed') {
      // Row was created (so the number is now reserved), but generation or
      // email failed - surface that clearly rather than pretending success.
      return res.status(207).json({ ok: false, job: cert, error: cert.error_message });
    }
    res.status(201).json({ ok: true, job: cert });
  } catch (err) {
    if (err instanceof DuplicateCertificateNumberError) {
      return res.status(409).json({ error: err.message });
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Dashboard: issue certificate failed', { error: message });
    res.status(500).json({ error: message });
  }
});

const UpdateNameBody = z.object({
  customerFirstName: z.string().trim().min(1).max(200),
  customerLastName: z.string().trim().max(200).optional().default(''),
});

/**
 * PATCH /admin/dashboard/api/certificates/:id
 * Corrects the customer name only. Does not regenerate or send anything by
 * itself - call POST .../resend afterwards to issue a corrected certificate.
 */
dashboardApiRouter.patch('/certificates/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const parsed = UpdateNameBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues });
  }

  const updated = await updateCertificateCustomerName(
    id,
    parsed.data.customerFirstName,
    parsed.data.customerLastName || null
  );
  if (!updated) return res.status(404).json({ error: 'Certificate not found' });

  logger.info('Dashboard: customer name corrected', { certificateId: id });
  res.json({ job: updated });
});

/**
 * POST /admin/dashboard/api/certificates/:id/resend
 * Regenerates the PDF from this row's current data and re-sends the email.
 * Works the same whether the certificate was previously 'emailed' (a
 * deliberate resend) or 'failed' (a retry) - there's no external system to
 * re-check against, so both cases just try again with what's on file.
 */
dashboardApiRouter.post('/certificates/:id/resend', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const cert = await resendCertificate(id);
    res.json({ ok: true, job: cert });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Dashboard: resend failed', { certificateId: id, error: message });
    res.status(422).json({ ok: false, error: message });
  }
});

/** GET /admin/dashboard/api/certificates/:id - single certificate detail. */
dashboardApiRouter.get('/certificates/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const cert = await getCertificateById(id);
  if (!cert) return res.status(404).json({ error: 'Not found' });
  res.json({ job: cert });
});
