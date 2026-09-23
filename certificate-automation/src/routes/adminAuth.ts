import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/** Shared by /admin/* and /admin/dashboard/api/* - requires x-admin-token to match ADMIN_API_TOKEN. */
export function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  if (!env.ADMIN_API_TOKEN) {
    return res.status(503).json({ error: 'Admin endpoints are disabled (ADMIN_API_TOKEN not set)' });
  }
  if (req.header('x-admin-token') !== env.ADMIN_API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
