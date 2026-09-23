/**
 * Minimal structured logger. Deliberately dependency-free (JSON lines to
 * stdout/stderr) so it works unmodified on any Node host and any log
 * aggregator can parse it.
 *
 * Never pass secrets (Shopify tokens, email API keys, storage credentials)
 * to this logger. Use maskEmail() for customer emails.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = {
    level,
    time: new Date().toISOString(),
    message,
    ...meta,
  };
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};

/** Masks a customer email for logs, e.g. "aashay@example.com" -> "aa***@example.com" */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(none)';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}
