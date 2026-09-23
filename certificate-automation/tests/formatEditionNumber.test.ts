import './setupEnv';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEditionNumber } from '../src/services/certificate/templateData';

test('formatEditionNumber zero-pads to the width of the edition total', () => {
  assert.equal(formatEditionNumber(7, 250), '007/250');
  assert.equal(formatEditionNumber(37, 250), '037/250');
  assert.equal(formatEditionNumber(142, 250), '142/250');
  assert.equal(formatEditionNumber(250, 250), '250/250');
});

test('formatEditionNumber adapts padding to a different edition total width', () => {
  assert.equal(formatEditionNumber(3, 50), '03/50');
  assert.equal(formatEditionNumber(3, 9999), '0003/9999');
});
