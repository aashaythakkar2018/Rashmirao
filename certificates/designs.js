/*
 * The designs a certificate can be issued for - mirrors
 * certificate-automation/config/designs.json.
 *
 *   code                   artwork file (assets/artwork/<code>.jpg) and the
 *                          key certificates are numbered under
 *   skuCode / skuLineCode  the design and fabric segments of the piece's SKU,
 *                          e.g. RHY-SGL-GRS-001/250. A design without a
 *                          skuCode accepts any code until one is added.
 *   lastKnownEditionNumber highest edition already sold before this
 *                          dashboard; the next SKU suggestion starts after it
 */
window.RHYTARA_DESIGNS = [
  { name: 'Echoes of Earth',       collection: "Nature's Rhythm", code: 'EOE', skuCode: 'EOE', skuLineCode: 'GRS', lastKnownEditionNumber: 2, editionTotal: 250 },
  { name: 'Grounding Nature',      collection: "Nature's Rhythm", code: 'GN',                                                               editionTotal: 250 },
  { name: 'Shifting Glacier',      collection: "Nature's Rhythm", code: 'SG',  skuCode: 'SGL', skuLineCode: 'GRS', lastKnownEditionNumber: 1, editionTotal: 250 },
  { name: 'Purple Petals Reverie', collection: "Nature's Rhythm", code: 'PPR', skuCode: 'PPR', skuLineCode: 'GRS', lastKnownEditionNumber: 1, editionTotal: 250 },
  { name: 'Magical Pansies',       collection: "Nature's Rhythm", code: 'MP',                                                                editionTotal: 250 }
];
