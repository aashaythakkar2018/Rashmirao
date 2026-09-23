import './setupEnv';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from '../src/utils/renderTemplate';

test('renderTemplate substitutes known variables', () => {
  const out = renderTemplate('Hi {{name}}, edition {{edition}}.', {
    name: 'Aashay',
    edition: '001/250',
  });
  assert.equal(out, 'Hi Aashay, edition 001/250.');
});

test('renderTemplate leaves unknown placeholders untouched', () => {
  const out = renderTemplate('{{known}} and {{unknown}}', { known: 'value' });
  assert.equal(out, 'value and {{unknown}}');
});

test('renderTemplate never regenerates SKU/edition values - it only substitutes given data', () => {
  const out = renderTemplate('SKU: {{sku}} Edition: {{edition_number}}', {
    sku: 'RHY-EOE-2024-44',
    edition_number: '001/250',
  });
  assert.equal(out, 'SKU: RHY-EOE-2024-44 Edition: 001/250');
});
