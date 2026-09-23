import fs from 'fs';
import path from 'path';
import { CertificateStorage } from '../CertificateStorage';
import { env, paths } from '../../../config/env';
import { signCertificateKey } from '../../../utils/signedUrl';

/**
 * Dev/test-only storage: saves PDFs to ./local-storage and serves them
 * through this app at a signed, expiring URL. NOT for production - swap
 * CERTIFICATE_STORAGE_PROVIDER=s3 for a real deployment (see
 * S3CertificateStorage).
 */
export class LocalCertificateStorage implements CertificateStorage {
  private ensureDir() {
    fs.mkdirSync(paths.localStorage, { recursive: true });
  }

  async uploadCertificate(input: { key: string; buffer: Buffer }): Promise<{ storageKey: string }> {
    this.ensureDir();
    const target = path.join(paths.localStorage, input.key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, input.buffer);
    return { storageKey: input.key };
  }

  async getCertificateUrl(storageKey: string): Promise<string> {
    const { token, expires } = signCertificateKey(
      storageKey,
      env.CERTIFICATE_STORAGE_SIGNED_URL_TTL_SECONDS
    );
    const params = new URLSearchParams({ key: storageKey, expires: String(expires), token });
    return `${env.APP_BASE_URL}/certificates/download?${params.toString()}`;
  }

  async deleteCertificate(storageKey: string): Promise<void> {
    const target = path.join(paths.localStorage, storageKey);
    fs.rmSync(target, { force: true });
  }
}
