import { loadDesigns, DesignConfig } from '../config/designs';

/**
 * Rhytara SKUs identify one physical saree and carry its edition number:
 *
 *   RHY-EOE-GRS-001/250
 *   │   │   │   └── edition number / edition size
 *   │   │   └────── fabric/line code
 *   │   └────────── design code (config/designs.json `skuCode`)
 *   └────────────── brand prefix
 *
 * The SKU is assigned by Rashmi and is authoritative - this module only reads
 * it, it never generates or renumbers one.
 */
const SKU_PATTERN = /^RHY-([A-Z]{2,5})-([A-Z]{2,5})-(\d+)\/(\d+)$/;

export const SKU_EXAMPLE = 'RHY-EOE-GRS-001/250';

export interface ParsedSku {
  sku: string; // normalised: upper-case, no spaces
  designCode: string;
  editionNumber: number;
  editionTotal: number;
}

export class InvalidSkuError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSkuError';
  }
}

export function normalizeSku(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function parseSku(raw: string): ParsedSku {
  const sku = normalizeSku(raw);
  const match = SKU_PATTERN.exec(sku);
  if (!match) {
    throw new InvalidSkuError(`"${raw.trim()}" is not a Rhytara SKU. Expected the format ${SKU_EXAMPLE}.`);
  }
  const [, designCode, , numberPart, totalPart] = match;
  const editionNumber = parseInt(numberPart, 10);
  const editionTotal = parseInt(totalPart, 10);

  if (numberPart.length !== totalPart.length) {
    // Keeps the certificate's "001/250" identical to the SKU's own digits.
    throw new InvalidSkuError(
      `The edition number in "${sku}" should be zero-padded to ${totalPart.length} digits, e.g. ${SKU_EXAMPLE}.`
    );
  }
  if (editionNumber < 1 || editionNumber > editionTotal) {
    throw new InvalidSkuError(`Edition ${numberPart}/${totalPart} in "${sku}" is outside the edition.`);
  }
  return { sku, designCode, editionNumber, editionTotal };
}

/** The design whose configured `skuCode` matches, if any. */
export function findDesignBySkuCode(skuCode: string): { name: string; design: DesignConfig } | null {
  for (const [name, design] of Object.entries(loadDesigns())) {
    if (design.skuCode && design.skuCode.toUpperCase() === skuCode.toUpperCase()) return { name, design };
  }
  return null;
}

/**
 * Checks a parsed SKU against the design chosen on the form. Designs with a
 * configured `skuCode` must match it exactly; a design without one yet
 * accepts any code, so staff are never blocked while codes are being added.
 */
export function checkSkuMatchesDesign(parsed: ParsedSku, designName: string, design: DesignConfig): void {
  const owner = findDesignBySkuCode(parsed.designCode);
  if (owner && owner.name !== designName) {
    throw new InvalidSkuError(`SKU ${parsed.sku} belongs to ${owner.name}, not ${designName}.`);
  }
  if (design.skuCode && design.skuCode.toUpperCase() !== parsed.designCode) {
    throw new InvalidSkuError(
      `${designName} SKUs start with RHY-${design.skuCode}-, but this one is ${parsed.sku}.`
    );
  }
  if (parsed.editionTotal !== design.editionTotal) {
    throw new InvalidSkuError(
      `${designName} is an edition of ${design.editionTotal}, but SKU ${parsed.sku} says /${parsed.editionTotal}.`
    );
  }
}
