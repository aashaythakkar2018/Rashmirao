import 'dotenv/config';
import path from 'path';
import { z } from 'zod';

/**
 * All runtime configuration comes from environment variables (see
 * .env.example). Nothing here is a secret - the actual values live in .env,
 * which is git-ignored.
 */
const EnvSchema = z.object({
  EMAIL_PROVIDER: z.enum(['resend', 'gmail', 'console']).default('console'),
  EMAIL_FROM: z.string().default('Rhytara <certificates@rhytara.com>'),
  EMAIL_REPLY_TO: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),

  // EMAIL_PROVIDER=gmail only: sends via Gmail's SMTP relay, authenticated
  // with an App Password (requires 2-Step Verification enabled on that
  // Google account - a regular account password will NOT work here).
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),

  CERTIFICATE_STORAGE_PROVIDER: z.enum(['s3', 'local']).default('local'),
  CERTIFICATE_STORAGE_BUCKET: z.string().optional(),
  CERTIFICATE_STORAGE_REGION: z.string().optional(),
  CERTIFICATE_STORAGE_ACCESS_KEY: z.string().optional(),
  CERTIFICATE_STORAGE_SECRET_KEY: z.string().optional(),
  CERTIFICATE_STORAGE_ENDPOINT: z.string().optional(),
  CERTIFICATE_STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().default(604800),
  // Signs local-storage download links (CERTIFICATE_STORAGE_PROVIDER=local
  // only - dev/test). Required in production if local storage is somehow
  // used; the app will refuse to sign links without it.
  CERTIFICATE_LINK_SECRET: z.string().optional(),

  APP_BASE_URL: z.string().default('http://localhost:3000'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CERTIFICATE_TEST_MODE: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),
  TEST_EMAIL: z.string().optional(),
  ADMIN_API_TOKEN: z.string().optional(),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[config] Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

// Resolved from process.cwd() rather than __dirname on purpose: __dirname
// points at wherever this file currently lives, which is src/config in dev
// (ts-node runs the .ts files directly) but dist/src/config after `npm run
// build` (tsc mirrors src/ under dist/, adding an extra directory level).
// config/, templates/, assets/ and migrations/ are plain data, never
// compiled into dist/, so __dirname arithmetic would resolve to the wrong
// place in production. process.cwd() is stable in both cases as long as the
// process is started from the project root - true for `npm run dev`, `npm
// start` and `npm run migrate` per the README.
export const paths = {
  root: process.cwd(),
  designsConfig: path.resolve(process.cwd(), 'config', 'designs.json'),
  templates: path.resolve(process.cwd(), 'templates'),
  assets: path.resolve(process.cwd(), 'assets'),
  localStorage: path.resolve(process.cwd(), 'local-storage'),
  publicDashboard: path.resolve(process.cwd(), 'public', 'dashboard'),
};
