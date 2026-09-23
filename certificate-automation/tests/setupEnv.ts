/**
 * Populates the minimum required environment variables before any test
 * imports src/config/env.ts (which validates and exits the process if
 * required vars are missing). Import this FIRST, before any other import,
 * in every test file that transitively touches src/config/env.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/rhytara_certificates_test';
process.env.CERTIFICATE_LINK_SECRET = process.env.CERTIFICATE_LINK_SECRET || 'test-link-secret';
process.env.CERTIFICATE_TEST_MODE = process.env.CERTIFICATE_TEST_MODE || 'true';
