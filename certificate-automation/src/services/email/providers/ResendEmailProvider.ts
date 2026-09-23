import { EmailMessage, EmailProvider } from '../EmailProvider';
import { env } from '../../../config/env';

/**
 * https://resend.com - a single HTTPS POST, no SDK dependency needed.
 * Swap for another provider (SendGrid, Postmark, SES) by implementing
 * EmailProvider the same way; nothing else in the app needs to change.
 */
export class ResendEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    if (!env.EMAIL_API_KEY) {
      throw new Error('EMAIL_API_KEY is required when EMAIL_PROVIDER=resend');
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        reply_to: message.replyTo,
        subject: message.subject,
        html: message.html,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Resend send failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
  }
}
