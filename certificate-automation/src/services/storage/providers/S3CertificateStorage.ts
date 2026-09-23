import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CertificateStorage } from '../CertificateStorage';
import { env } from '../../../config/env';

/**
 * Production storage: any S3-compatible object store (AWS S3, Cloudflare R2,
 * Backblaze B2, etc - set CERTIFICATE_STORAGE_ENDPOINT for non-AWS). The
 * bucket should be PRIVATE; access is exclusively via short-lived signed
 * URLs, never a public bucket URL (spec section 10).
 */
export class S3CertificateStorage implements CertificateStorage {
  private client: S3Client;
  private bucket: string;

  constructor() {
    if (!env.CERTIFICATE_STORAGE_BUCKET) {
      throw new Error('CERTIFICATE_STORAGE_BUCKET is required when CERTIFICATE_STORAGE_PROVIDER=s3');
    }
    this.bucket = env.CERTIFICATE_STORAGE_BUCKET;
    this.client = new S3Client({
      region: env.CERTIFICATE_STORAGE_REGION || 'auto',
      endpoint: env.CERTIFICATE_STORAGE_ENDPOINT || undefined,
      credentials:
        env.CERTIFICATE_STORAGE_ACCESS_KEY && env.CERTIFICATE_STORAGE_SECRET_KEY
          ? {
              accessKeyId: env.CERTIFICATE_STORAGE_ACCESS_KEY,
              secretAccessKey: env.CERTIFICATE_STORAGE_SECRET_KEY,
            }
          : undefined,
    });
  }

  async uploadCertificate(input: {
    key: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<{ storageKey: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.buffer,
        ContentType: input.contentType,
        // Private by default - no ACL: 'public-read'. Access only via
        // getCertificateUrl()'s signed URL.
      })
    );
    return { storageKey: input.key };
  }

  async getCertificateUrl(storageKey: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    return getSignedUrl(this.client, command, {
      expiresIn: env.CERTIFICATE_STORAGE_SIGNED_URL_TTL_SECONDS,
    });
  }

  async deleteCertificate(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}
