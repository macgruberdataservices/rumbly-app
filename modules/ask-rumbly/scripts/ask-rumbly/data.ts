// Terminal-only stand-in for src/data/importPipeline.ts's runImport(),
// reusing the exact same merge logic minus the two React Native writes
// (fileStore.ts/db.ts) -- this lets the Ask Rumbly executor prototype run
// against real, live restaurant/menu data in plain Node, no app or
// Simulator involved. If importPipeline.ts's merge logic changes, mirror
// the change here too -- there is no single shared source between the two
// on purpose, since this file must stay usable outside the RN runtime.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataManifest, Restaurant, MenuItem, HoursData, SearchIndexEntry } from '../../../../src/data/types.ts';
import type { AskRumblyData } from '../../../../src/askRumbly/dataTypes.ts';
import { normalizeForSearch } from '../../../../src/data/diacritics.ts';

const DATA_BASE_URL = 'https://macgruberdataservices.github.io/disney-dining/data/';
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '.cache');
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function fetchJSON<T>(fileName: string): Promise<T> {
  const res = await fetch(`${DATA_BASE_URL}${fileName}`);
  if (!res.ok) throw new Error(`Fetch failed for ${fileName}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

async function fetchOptionalJSON<T>(fileName: string | undefined, fallback: T): Promise<T> {
  if (!fileName) return fallback;
  return fetchJSON<T>(fileName);
}

function toSearchIndexEntry(item: MenuItem): SearchIndexEntry {
  return {
    restaurant_id: item.restaurant_id,
    item_id: item.item_id,
    item: item.item,
    _norm: normalizeForSearch(item.item),
    category: item.category,
    price_display: item.price_display,
    price_changed: item.price_changed,
    previous_price: item.previous_price,
    show_in_menu: item.show_in_menu,
    is_festival_item: item.is_festival_item,
    dining_period: item.dining_period,
    norm_categories: item.norm_categories,
    is_kids: item.is_kids,
    is_allergy_friendly: item.is_allergy_friendly,
    has_allergy_option: item.has_allergy_option,
    allergens: item.allergens,
    allergy_free_of: item.allergy_free_of,
    first_seen: item.first_seen,
    description: item.description,
  };
}

export type LoadedData = AskRumblyData;

async function fetchAndMerge(): Promise<LoadedData> {
  const manifest = await fetchJSON<DataManifest>('data_manifest.json');
  const [rawRestaurants, hoursData, rawHandCodedRestaurants] = await Promise.all([
    fetchJSON<Restaurant[]>(manifest.restaurant_data),
    fetchJSON<HoursData>(manifest.hours_data),
    fetchOptionalJSON<Restaurant[]>(manifest.hand_coded_data, []),
  ]);

  const byId = new Map<string, Restaurant>();
  for (const r of rawRestaurants) {
    if (r.show_in_app) byId.set(r.restaurant_id, r);
  }
  for (const raw of rawHandCodedRestaurants) {
    const existing = byId.get(raw.restaurant_id);
    if (existing) {
      byId.set(raw.restaurant_id, {
        ...existing,
        park: existing.park ?? raw.park,
        area: existing.area ?? raw.area,
        resort: existing.resort ?? raw.resort,
      });
    } else if (raw.show_in_app) {
      byId.set(raw.restaurant_id, raw);
    }
  }
  const restaurants = Array.from(byId.values());

  const [rawMenuItems, rawHandCodedMenuItems] = await Promise.all([
    fetchJSON<MenuItem[]>(manifest.menu_data),
    fetchOptionalJSON<MenuItem[]>(manifest.hand_coded_menu_data, []),
  ]);
  const visibleHandCodedMenuItems = rawHandCodedMenuItems.filter((item) => byId.has(item.restaurant_id));
  const menuItems = rawMenuItems.concat(visibleHandCodedMenuItems);
  const searchIndex = menuItems.map(toSearchIndexEntry);

  return { restaurants, searchIndex, menuItems, hoursData };
}

export async function loadData(opts: { refresh?: boolean } = {}): Promise<LoadedData> {
  const cacheFile = join(CACHE_DIR, 'loaded_data.json');
  let cached: { fetchedAt: number; data: LoadedData } | null = null;
  if (!opts.refresh && existsSync(cacheFile)) {
    try {
      cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as { fetchedAt: number; data: LoadedData };
      if (Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS) {
        return cached.data;
      }
    } catch {
      // Corrupt cache: fetch a clean copy below. If that also fails, the
      // original parse error is less useful than the actual fetch failure.
      cached = null;
    }
  }
  try {
    const data = await fetchAndMerge();
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ fetchedAt: Date.now(), data }));
    return data;
  } catch (error) {
    // The validation harness should remain usable offline with a stale but
    // internally-consistent snapshot. Production app integration will use
    // the app's own local imported dataset rather than this Node cache.
    if (cached) return cached.data;
    throw error;
  }
}
