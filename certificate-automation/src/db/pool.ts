import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on('error', (err) => {
  // Idle client errors (e.g. connection dropped by the DB host) should not
  // crash the process - log and let the pool recover.
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected error on idle client', err);
});
