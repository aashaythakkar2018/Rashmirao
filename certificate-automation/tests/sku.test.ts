import './setupEnv';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSku, checkSkuMatchesDesign, findDesignBySkuCode, InvalidSkuError } from '../src/certificates/sku';
import { findDesignForProductTitle } from '../src/config/designs';

test('parseSku reads the four SKUs already sold', () => {
  assert.deepEqual(parseSku('RHY-PPR-GRS-001/250'), {
    sku: 'RHY-PPR-GRS-001/250',
    designCode: 'PPR',
    editionNumber: 1,
    editionTotal: 250,
  });
  assert.equal(parseSku('RHY-SGL-GRS-001/250').designCode, 'SGL');
  assert.equal(parseSku('RHY-EOE-GRS-001/250').editionNumber, 1);
  assert.equal(parseSku('RHY-EOE-GRS-002/250').editionNumber, 2);
});

test('parseSku normalises case and stray spaces', () => {
  assert.equal(parseSku('  rhy-eoe-grs-002 / 250 ').sku, 'RHY-EOE-GRS-002/250');
});

test('parseSku rejects malformed SKUs', () => {
  assert.throws(() => parseSku('EOE-001'), InvalidSkuError);
  assert.throws(() => parseSku('RHY-EOE-GRS-001'), InvalidSkuError);
  assert.throws(() => parseSku('RHY-EOE-GRS-1/250'), /zero-padded/);
  assert.throws(() => parseSku('RHY-EOE-GRS-000/250'), /outside the edition/);
  assert.throws(() => parseSku('RHY-EOE-GRS-251/250'), /outside the edition/);
});

test('findDesignBySkuCode maps SKU codes to designs', () => {
  assert.equal(findDesignBySkuCode('SGL')?.name, 'Shifting Glacier');
  assert.equal(findDesignBySkuCode('eoe')?.name, 'Echoes of Earth');
  assert.equal(findDesignBySkuCode('ZZZ'), null);
});

test('checkSkuMatchesDesign accepts a SKU for its own design', () => {
  const design = findDesignForProductTitle('Echoes of Earth')!;
  assert.doesNotThrow(() => checkSkuMatchesDesign(parseSku('RHY-EOE-GRS-002/250'), 'Echoes of Earth', design));
});

test('checkSkuMatchesDesign rejects a SKU from another design', () => {
  const design = findDesignForProductTitle('Echoes of Earth')!;
  assert.throws(
    () => checkSkuMatchesDesign(parseSku('RHY-PPR-GRS-001/250'), 'Echoes of Earth', design),
    /belongs to Purple Petals Reverie/
  );
  assert.throws(
    () => checkSkuMatchesDesign(parseSku('RHY-XYZ-GRS-001/250'), 'Echoes of Earth', design),
    /start with RHY-EOE-/
  );
});

test('checkSkuMatchesDesign accepts any unclaimed code for a design without a skuCode yet', () => {
  const design = findDesignForProductTitle('Grounding Nature')!;
  assert.equal(design.skuCode, undefined);
  assert.doesNotThrow(() => checkSkuMatchesDesign(parseSku('RHY-GRN-GRS-001/250'), 'Grounding Nature', design));
});

test('checkSkuMatchesDesign rejects a SKU with the wrong edition size', () => {
  const design = findDesignForProductTitle('Echoes of Earth')!;
  assert.throws(
    () => checkSkuMatchesDesign(parseSku('RHY-EOE-GRS-001/100'), 'Echoes of Earth', design),
    /edition of 250/
  );
});
