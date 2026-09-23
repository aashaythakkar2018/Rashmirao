import fs from 'fs';
import path from 'path';

// A genuine 1x1 fully-transparent PNG (RGBA 0,0,0,0) - verified by decoding
// and checking the pixel value, not just copied from memory. An earlier
// version of this constant was actually an OPAQUE BLACK pixel, which made
// every certificate render solid black boxes wherever a brand asset (logo/
// signature/artwork) hadn't been supplied yet.
const TRANSPARENT_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

/**
 * Reads a local image file into a base64 data: URI so Puppeteer's
 * page.setContent() can render it without needing a file:// base URL or an
 * HTTP server for assets. Falls back to a 1x1 transparent pixel if the file
 * doesn't exist yet (e.g. brand assets haven't been supplied - see spec
 * section 34: build the system so these can be added without code changes).
 */
export function assetToDataUri(absolutePath: string): string {
  try {
    const buf = fs.readFileSync(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return TRANSPARENT_PIXEL_PNG;
  }
}
