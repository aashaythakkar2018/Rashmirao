import './setupEnv';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDesignForProductTitle, isEligibleProduct } from '../src/config/designs';

test('findDesignForProductTitle matches a configured design', () => {
  const design = findDesignForProductTitle('Echoes of Earth');
  assert.ok(design);
  assert.equal(design?.code, 'EOE');
  assert.equal(design?.collection, "Nature's Rhythm");
});

test('findDesignForProductTitle is case-insensitive and trims whitespace', () => {
  const design = findDesignForProductTitle('  echoes OF earth  ');
  assert.ok(design);
  assert.equal(design?.code, 'EOE');
});

test('findDesignForProductTitle returns null for an unconfigured product', () => {
  assert.equal(findDesignForProductTitle('Some Other Product'), null);
});

test('isEligibleProduct reflects the same matching rules', () => {
  assert.equal(isEligibleProduct('Shifting Glacier'), true);
  assert.equal(isEligibleProduct('Rhytara Gift Card'), false);
});
