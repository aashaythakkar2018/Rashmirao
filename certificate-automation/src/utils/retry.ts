import { logger } from './logger';

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn`, retrying on failure with exponential backoff + jitter.
 * Used for certificate generation and email sending - both of which can fail
 * transiently (renderer hiccup, provider timeout) and should not be treated
 * as a permanent failure on the first try.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 8000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt === attempts;
      logger.warn(`${opts.label} failed on attempt ${attempt}/${attempts}`, {
        error: err instanceof Error ? err.message : String(err),
        willRetry: !isLast,
      });
      if (isLast) break;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * backoff * 0.25;
      await sleep(backoff + jitter);
    }
  }
  throw lastError;
}
