import { EmailMessage, EmailProvider } from '../EmailProvider';
import { logger, maskEmail } from '../../../utils/logger';

/** Dev/test provider: logs the email instead of sending it. Never used in production. */
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    logger.info('[ConsoleEmailProvider] Would send email', {
      to: maskEmail(message.to),
      subject: message.subject,
      htmlLength: message.html.length,
    });
  }
}
