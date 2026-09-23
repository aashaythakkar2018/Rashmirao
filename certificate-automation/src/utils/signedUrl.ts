import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Signs {key, expires} so the local-storage download route (dev/test only)
 * can verify a link hasn't been tampered with or expired, without a
 * database round-trip. Mirrors what a real S3 presigned URL gives you for
 * free - kept here only so local mode behaves the same way.
 */
export function signCertificateKey(storageKey: string, ttlSeconds: number): { token: string; expires: number } {
  if (!env.CERTIFICATE_LINK_SECRET) {
    throw new Error(
      'CERTIFICATE_LINK_SECRET is not set - required to sign local certificate download links.'
    );
  }
  const expires = Date.now() + ttlSeconds * 1000;
  const token = crypto
    .createHmac('sha256', env.CERTIFICATE_LINK_SECRET)
    .update(`${storageKey}:${expires}`)
    .digest('hex');
  return { token, expires };
}

export function verifyCertificateKeyToken(
  storageKey: string,
  expires: number,
  token: string
): boolean {
  if (!env.CERTIFICATE_LINK_SECRET) return false;
  if (Date.now() > expires) return false;
  const expected = crypto
    .createHmac('sha256', env.CERTIFICATE_LINK_SECRET)
    .update(`${storageKey}:${expires}`)
    .digest('hex');
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(token, 'utf-8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
