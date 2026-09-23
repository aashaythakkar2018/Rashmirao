import './setupEnv';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFilenamePart, buildCertificateFilename } from '../src/utils/sanitize';

test('sanitizeFilenamePart strips punctuation and whitespace', () => {
  assert.equal(sanitizeFilenamePart('#1001'), '1001');
  assert.equal(sanitizeFilenamePart('RHY-EOE-2024-44'), 'RHY-EOE-2024-44');
  assert.equal(sanitizeFilenamePart('has spaces / slashes'), 'hasspacesslashes');
});

test('buildCertificateFilename matches the spec example', () => {
  const filename = buildCertificateFilename('#1001', 'RHY-EOE-2024-44');
  assert.equal(filename, 'Rhytara_Certificate_1001_RHY-EOE-2024-44.pdf');
});

test('buildCertificateFilename falls back safely on empty input', () => {
  const filename = buildCertificateFilename('', '');
  assert.equal(filename, 'Rhytara_Certificate_order_sku.pdf');
});
