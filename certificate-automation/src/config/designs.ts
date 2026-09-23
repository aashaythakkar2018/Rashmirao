import fs from 'fs';
import { paths } from './env';

export interface DesignConfig {
  collection: string;
  code: string;
  editionTotal: number;
  story: string;
}

export type DesignsMap = Record<string, DesignConfig>;

let cache: DesignsMap | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000; // re-read the file at most once a minute so a
// non-developer editing config/designs.json doesn't require a restart.

/**
 * Loads config/designs.json. This file is intentionally plain JSON (not code)
 * so a non-developer can edit design names/stories/edition sizes without
 * touching the app.
 */
export function loadDesigns(): DesignsMap {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) return cache;

  const raw = fs.readFileSync(paths.designsConfig, 'utf-8');
  const parsed = JSON.parse(raw) as DesignsMap;
  cache = parsed;
  cacheLoadedAt = now;
  return parsed;
}

/**
 * Matches a design name typed on the "Issue certificate" form against
 * config/designs.json. Matching is case-insensitive and trims whitespace,
 * but otherwise exact - we deliberately do not fuzzy-match, since a wrong
 * match would put the wrong story/collection on a legal certificate.
 */
export function findDesignForProductTitle(designName: string): DesignConfig | null {
  const designs = loadDesigns();
  const normalized = designName.trim().toLowerCase();
  for (const [name, config] of Object.entries(designs)) {
    if (name.trim().toLowerCase() === normalized) return config;
  }
  return null;
}

export function isEligibleProduct(designName: string): boolean {
  return findDesignForProductTitle(designName) !== null;
}
