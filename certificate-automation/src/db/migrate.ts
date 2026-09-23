/**
 * Hand-rolled migration runner: applies every .sql file in /migrations, in
 * filename order, exactly once. Tracks what's been applied in a
 * schema_migrations table. Kept dependency-free on purpose.
 *
 * Usage: npm run migrate
 *
 * Deliberately does NOT import src/config/env.ts (which validates the
 * entire app config, including Shopify/email credentials). Creating
 * database tables has nothing to do with Shopify or email, so this script
 * only requires DATABASE_URL - it must be runnable before any other
 * credential exists.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error('[migrate] DATABASE_URL is required (set it in .env)');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function run() {
  await ensureMigrationsTable();

  // process.cwd(), not __dirname - see the comment on `paths` in
  // src/config/env.ts for why (migrations/ is never compiled into dist/).
  const dir = path.resolve(process.cwd(), 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows: applied } = await pool.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations'
  );
  const appliedSet = new Set(applied.map((r) => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) {
      // eslint-disable-next-line no-console
      console.log(`[migrate] skipping already-applied ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      // eslint-disable-next-line no-console
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      // eslint-disable-next-line no-console
      console.error(`[migrate] failed applying ${file}`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
