import nodemailer, { Transporter } from 'nodemailer';
import { EmailMessage, EmailProvider } from '../EmailProvider';
import { env } from '../../../config/env';

/**
 * Sends via Gmail's SMTP relay, authenticated with an App Password (a
 * 16-character code from https://myaccount.google.com/apppasswords -
 * requires 2-Step Verification to be turned on for that Google account;
 * the regular account password will be rejected by Gmail for SMTP).
 *
 * Fine for low volume (Gmail's own cap is ~500 messages/day on a normal
 * account) but not a dedicated transactional provider: no delivery
 * analytics, more likely to be treated as bulk mail at higher volume, and
 * the "From" address is constrained to the Gmail account itself (Gmail
 * will silently rewrite an unrelated From: header to this account's
 * address, so EMAIL_FROM is only used as a display name here, not to send
 * "as" a different domain - use ResendEmailProvider for that).
 */
export class GmailEmailProvider implements EmailProvider {
  private transporter: Transporter;

  constructor() {
    if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD are required when EMAIL_PROVIDER=gmail');
    }
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
      },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    // Gmail requires the From address to be the authenticated account
    // itself; we still let EMAIL_FROM supply a friendly display name if
    // one was given (e.g. "Rhytara <ignored@rhytara.com>" -> "Rhytara").
    const displayName = env.EMAIL_FROM.includes('<') ? env.EMAIL_FROM.split('<')[0].trim() : 'Rhytara';

    await this.transporter.sendMail({
      from: `${displayName} <${env.GMAIL_USER}>`,
      to: message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      html: message.html,
    });
  }
}
