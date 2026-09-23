export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Email abstraction so the transactional provider is replaceable without
 * touching job/webhook code (spec section 11). Implementations: ResendEmailProvider
 * (production), ConsoleEmailProvider (dev/test - just logs, sends nothing).
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
