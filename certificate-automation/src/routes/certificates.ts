import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { env, paths } from '../config/env';
import { verifyCertificateKeyToken } from '../utils/signedUrl';

export const certificatesRouter = Router();

/**
 * GET /certificates/download?key=...&expires=...&token=...
 *
 * Only used by the "local" storage provider (dev/test). The "s3" provider
 * returns a presigned S3 URL directly and never routes through this app.
 */
certificatesRouter.get('/download', (req, res) => {
  if (env.CERTIFICATE_STORAGE_PROVIDER !== 'local') {
    return res.status(404).send('Not found');
  }

  const key = String(req.query.key || '');
  const expires = Number(req.query.expires || 0);
  const token = String(req.query.token || '');

  if (!key || !expires || !token || !verifyCertificateKeyToken(key, expires, token)) {
    return res.status(403).send('Invalid or expired link');
  }

  const filePath = path.join(paths.localStorage, key);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Certificate not found');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath);
});
