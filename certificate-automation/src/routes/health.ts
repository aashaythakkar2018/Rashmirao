import { Router } from 'express';

export const healthRouter = Router();

/** GET /health (mounted at '/health' in index.ts, so the route itself is '/') */
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});
