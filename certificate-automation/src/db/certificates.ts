import { pool } from './pool';

export type CertificateStatus = 'pending' | 'processing' | 'generated' | 'emailed' | 'failed';

export interface Certificate {
  id: number;
  order_number: string;
  customer_first_name: string;
  customer_last_name: string | null;
  customer_email: string;
  design_name: string;
  design_code: string;
  certificate_number: number;
  edition_total: number;
  certificate_url: string | null;
  storage_key: string | null;
  status: CertificateStatus;
  attempt_count: number;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  sent_at: Date | null;
}

export interface NewCertificateInput {
  order_number: string;
  customer_first_name: string;
  customer_last_name: string | null;
  customer_email: string;
  design_name: string;
  design_code: string;
  certificate_number: number;
  edition_total: number;
}

export class DuplicateCertificateNumberError extends Error {
  constructor(designName: string, certificateNumber: number) {
    super(`Certificate number ${certificateNumber} has already been issued for ${designName}.`);
    this.name = 'DuplicateCertificateNumberError';
  }
}

/**
 * Creates a new certificate row. Relies on the UNIQUE (design_code,
 * certificate_number) constraint as the authoritative duplicate check -
 * even under concurrent requests, the database rejects a second row for
 * the same design+number rather than silently allowing it.
 */
export async function createCertificate(input: NewCertificateInput): Promise<Certificate> {
  try {
    const res = await pool.query<Certificate>(
      `INSERT INTO certificates (
         order_number, customer_first_name, customer_last_name, customer_email,
         design_name, design_code, certificate_number, edition_total, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING *`,
      [
        input.order_number,
        input.customer_first_name,
        input.customer_last_name,
        input.customer_email,
        input.design_name,
        input.design_code,
        input.certificate_number,
        input.edition_total,
      ]
    );
    return res.rows[0];
  } catch (err: any) {
    if (err && err.code === '23505') {
      // unique_violation
      throw new DuplicateCertificateNumberError(input.design_name, input.certificate_number);
    }
    throw err;
  }
}

export async function markProcessing(id: number) {
  await pool.query(
    `UPDATE certificates SET status = 'processing', attempt_count = attempt_count + 1, updated_at = now() WHERE id = $1`,
    [id]
  );
}

export async function markGenerated(id: number, certificateUrl: string, storageKey: string) {
  await pool.query(
    `UPDATE certificates
     SET status = 'generated', certificate_url = $2, storage_key = $3, error_message = NULL, updated_at = now()
     WHERE id = $1`,
    [id, certificateUrl, storageKey]
  );
}

export async function markEmailed(id: number) {
  await pool.query(
    `UPDATE certificates SET status = 'emailed', sent_at = now(), updated_at = now() WHERE id = $1`,
    [id]
  );
}

export async function markFailed(id: number, errorMessage: string) {
  await pool.query(
    `UPDATE certificates SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1`,
    [id, errorMessage]
  );
}

export async function getCertificateById(id: number): Promise<Certificate | null> {
  const res = await pool.query<Certificate>(`SELECT * FROM certificates WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function updateCertificateCustomerName(
  id: number,
  firstName: string,
  lastName: string | null
): Promise<Certificate | null> {
  const res = await pool.query<Certificate>(
    `UPDATE certificates SET customer_first_name = $2, customer_last_name = $3, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, firstName, lastName]
  );
  return res.rows[0] ?? null;
}

/** Customer-facing listing, for a future self-service lookup page. */
export async function getCertificatesByEmail(email: string): Promise<Certificate[]> {
  const res = await pool.query<Certificate>(
    `SELECT * FROM certificates WHERE customer_email = $1 AND status = 'emailed' ORDER BY created_at DESC`,
    [email]
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// Dashboard queries
// ---------------------------------------------------------------------------

export interface ListCertificatesFilter {
  status?: CertificateStatus;
  designCode?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export async function listCertificates(
  filter: ListCertificatesFilter
): Promise<{ rows: Certificate[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filter.designCode) {
    params.push(filter.designCode);
    conditions.push(`design_code = $${params.length}`);
  }
  if (filter.search) {
    params.push(`%${filter.search}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(customer_first_name ILIKE ${p} OR customer_last_name ILIKE ${p} OR customer_email ILIKE ${p} ` +
        `OR order_number ILIKE ${p} OR design_name ILIKE ${p} OR CAST(certificate_number AS TEXT) ILIKE ${p})`
    );
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await pool.query<{ count: string }>(
    `SELECT count(*) FROM certificates ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

  const limit = Math.min(Math.max(filter.pageSize, 1), 200);
  const offset = Math.max(filter.page - 1, 0) * limit;
  const rowsRes = await pool.query<Certificate>(
    `SELECT * FROM certificates ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: rowsRes.rows, total };
}

export interface CertificateStats {
  totalCertificates: number;
  byStatus: Record<string, number>;
  byDesign: {
    designName: string;
    designCode: string;
    issuedCount: number;
    editionTotal: number;
    nextSuggestedNumber: number;
  }[];
}

export async function getCertificateStats(editionTotals: Record<string, number>): Promise<CertificateStats> {
  const statusRes = await pool.query<{ status: string; count: string }>(
    `SELECT status, count(*) FROM certificates GROUP BY status`
  );
  const byStatus: Record<string, number> = {};
  let totalCertificates = 0;
  for (const row of statusRes.rows) {
    const count = parseInt(row.count, 10);
    byStatus[row.status] = count;
    totalCertificates += count;
  }

  const designRes = await pool.query<{
    design_name: string;
    design_code: string;
    issued_count: string;
    max_number: number | null;
  }>(
    `SELECT design_name, design_code, count(*) AS issued_count, max(certificate_number) AS max_number
     FROM certificates
     GROUP BY design_name, design_code
     ORDER BY design_name ASC`
  );

  const byDesign = designRes.rows.map((r) => ({
    designName: r.design_name,
    designCode: r.design_code,
    issuedCount: parseInt(r.issued_count, 10),
    editionTotal: editionTotals[r.design_code] ?? 250,
    nextSuggestedNumber: (r.max_number ?? 0) + 1,
  }));

  return { totalCertificates, byStatus, byDesign };
}

/** Highest certificate_number already used for a design - powers the "suggested next number" hint. */
export async function getNextSuggestedNumber(designCode: string): Promise<number> {
  const res = await pool.query<{ max_number: number | null }>(
    `SELECT max(certificate_number) AS max_number FROM certificates WHERE design_code = $1`,
    [designCode]
  );
  return (res.rows[0]?.max_number ?? 0) + 1;
}
