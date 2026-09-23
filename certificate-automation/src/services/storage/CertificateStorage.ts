/**
 * Storage abstraction so the certificate persistence layer is replaceable
 * without touching certificate-generation or job-processing code (spec
 * section 10). Implementations: LocalCertificateStorage (dev/test only),
 * S3CertificateStorage (production - S3 or any S3-compatible provider).
 */
export interface CertificateStorage {
  /**
   * Uploads a PDF and returns a storage key (an internal reference, not
   * necessarily a public URL) that getCertificateUrl() can later resolve.
   */
  uploadCertificate(input: {
    key: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<{ storageKey: string }>;

  /** Resolves a storage key to a secure, time-limited HTTPS URL. */
  getCertificateUrl(storageKey: string): Promise<string>;

  deleteCertificate(storageKey: string): Promise<void>;
}
