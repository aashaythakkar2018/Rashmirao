import { env } from '../../config/env';
import { EmailProvider } from './EmailProvider';
import { ConsoleEmailProvider } from './providers/ConsoleEmailProvider';
import { ResendEmailProvider } from './providers/ResendEmailProvider';
import { GmailEmailProvider } from './providers/GmailEmailProvider';

let instance: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (instance) return instance;
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      instance = new ResendEmailProvider();
      break;
    case 'gmail':
      instance = new GmailEmailProvider();
      break;
    case 'console':
    default:
      instance = new ConsoleEmailProvider();
      break;
  }
  return instance;
}

export type { EmailProvider, EmailMessage } from './EmailProvider';
