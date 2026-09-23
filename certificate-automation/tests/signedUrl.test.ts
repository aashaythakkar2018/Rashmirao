import './setupEnv';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signCertificateKey, verifyCertificateKeyToken } from '../src/utils/signedUrl';

test('a freshly signed token verifies successfully', () => {
  const { token, expires } = signCertificateKey('certificates/1/foo.pdf', 3600);
  assert.equal(verifyCertificateKeyToken('certificates/1/foo.pdf', expires, token), true);
});

test('a token does not verify against a different key', () => {
  const { token, expires } = signCertificateKey('certificates/1/foo.pdf', 3600);
  assert.equal(verifyCertificateKeyToken('certificates/2/bar.pdf', expires, token), false);
});

test('an expired token is rejected', () => {
  const { token } = signCertificateKey('certificates/1/foo.pdf', 3600);
  const pastExpiry = Date.now() - 1000;
  assert.equal(verifyCertificateKeyToken('certificates/1/foo.pdf', pastExpiry, token), false);
});

test('a tampered token is rejected', () => {
  const { expires } = signCertificateKey('certificates/1/foo.pdf', 3600);
  assert.equal(verifyCertificateKeyToken('certificates/1/foo.pdf', expires, 'not-the-real-token'), false);
});
