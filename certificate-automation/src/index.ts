import express from 'express';
import { env, paths } from './config/env';
import { logger } from './utils/logger';
import { healthRouter } from './routes/health';
import { certificatesRouter } from './routes/certificates';
import { customerRouter } from './routes/customer';
import { dashboardApiRouter } from './routes/dashboardApi';
import { closeBrowser } from './services/certificate/renderPdf';

const app = express();

// Basic rate limiting on public endpoints, dependency-free. For production
// behind multiple app instances, replace with a shared-store limiter (e.g.
// Redis) - this is per-process and resets on restart.
app.use(simpleRateLimit({ windowMs: 60_000, max: 120 }));

app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRouter);

// The dashboard's API (token-gated) is mounted BEFORE its static file
// server so /admin/dashboard/api/* is matched here rather than falling
// through to the static handler.
app.use('/admin/dashboard/api', dashboardApiRouter);
app.use('/admin/dashboard', express.static(paths.publicDashboard));

app.use('/certificates', certificatesRouter);
app.use('/customer', customerRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled request error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(env.PORT, () => {
  logger.info(`Rhytara certificate service listening on port ${env.PORT}`, {
    testMode: env.CERTIFICATE_TEST_MODE,
    storageProvider: env.CERTIFICATE_STORAGE_PROVIDER,
    emailProvider: env.EMAIL_PROVIDER,
  });
});

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down`);
  server.close();
  await closeBrowser();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

/** Fixed-window in-memory rate limiter. Simple on purpose - see comment above. */
function simpleRateLimit(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > opts.max) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
}
