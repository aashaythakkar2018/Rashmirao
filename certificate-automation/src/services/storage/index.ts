import { env } from '../../config/env';
import { CertificateStorage } from './CertificateStorage';
import { LocalCertificateStorage } from './providers/LocalCertificateStorage';
import { S3CertificateStorage } from './providers/S3CertificateStorage';

let instance: CertificateStorage | null = null;

/**
 * Selects the storage provider from CERTIFICATE_STORAGE_PROVIDER. Callers
 * depend only on the CertificateStorage interface, so switching providers
 * is a config change, not a code change.
 */
export function getCertificateStorage(): CertificateStorage {
  if (instance) return instance;
  switch (env.CERTIFICATE_STORAGE_PROVIDER) {
    case 's3':
      instance = new S3CertificateStorage();
      break;
    case 'local':
    default:
      instance = new LocalCertificateStorage();
      break;
  }
  return instance;
}

export type { CertificateStorage } from './CertificateStorage';
