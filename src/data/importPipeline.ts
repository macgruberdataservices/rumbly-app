// Ported from Disney Dining Dev's importFreshData(): fetches the three
// content-hashed files named in a manifest and stores them per the same
// split as the source app — restaurants/hours/search-index as in-memory-
// sized blobs (fileStore.ts), full menu item records indexed on demand
// (db.ts). menu_data.json is parsed once and walked once (not twice) to
// build both the SQLite insert batch and the SEARCH_INDEX projection
// together, since re-scanning a 45k-item array twice is pure waste.
//
// Note: the live data_manifest.json currently has no hand_coded_data /
// hand_coded_menu_data keys — the source app treats a missing key as
// "nothing published yet" rather than an error, and so does this port.
// There's nothing to merge from hand-coded sources until those keys
// actually appear in the manifest.

import type { DataManifest, Restaurant, MenuItem, HoursData, SearchIndexEntry } from './types';
import { DATA_BASE_URL, LOCAL_FILES } from './constants';
import { writeJSON } from './fileStore';
import { clearMenuItems, insertMenuItemsBatch } from './db';
import { normalizeForSearch } from './diacritics';

async function fetchJSON<T>(fileName: string): Promise<T> {
  const res = await fetch(`${DATA_BASE_URL}${fileName}`);
  if (!res.ok) {
    throw new Error(`Fetch failed for ${fileName}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function toSearchIndexEntry(item: MenuItem): SearchIndexEntry {
  return {
    restaurant_id: item.restaurant_id,
    item: item.item,
    _norm: normalizeForSearch(item.item),
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
  };
}

// Batched inserts keep any single SQL statement/transaction step from
// blocking the JS thread for too long on ~45k rows.
const INSERT_CHUNK_SIZE = 2000;

export interface ImportStats {
  restaurantCount: number;
  menuItemCount: number;
  restaurantsWithHours: number;
}

export async function runImport(manifest: DataManifest): Promise<ImportStats> {
  const [rawRestaurants, hoursData] = await Promise.all([
    fetchJSON<Restaurant[]>(manifest.restaurant_data),
    fetchJSON<HoursData>(manifest.hours_data),
  ]);

  // The published restaurant_data.json has a known upstream data-quality
  // issue: hand-coded entries (snack carts/kiosks without a real Disney
  // facility id) can appear twice under the same restaurant_id. The source
  // PWA never notices because it always builds restaurants into a Map
  // keyed by restaurant_id (last write wins) rather than keeping a raw
  // array — replicate that de-dupe here rather than assuming the source
  // data is clean.
  const byId = new Map<string, Restaurant>();
  for (const r of rawRestaurants) {
    if (r.show_in_app) byId.set(r.restaurant_id, r);
  }
  const restaurants = Array.from(byId.values());
  await writeJSON(LOCAL_FILES.restaurantData, restaurants);
  await writeJSON(LOCAL_FILES.hoursData, hoursData);

  const rawMenuItems = await fetchJSON<MenuItem[]>(manifest.menu_data);

  const searchIndex: SearchIndexEntry[] = new Array(rawMenuItems.length);
  await clearMenuItems();
  for (let start = 0; start < rawMenuItems.length; start += INSERT_CHUNK_SIZE) {
    const chunk = rawMenuItems.slice(start, start + INSERT_CHUNK_SIZE);
    for (let i = 0; i < chunk.length; i++) {
      searchIndex[start + i] = toSearchIndexEntry(chunk[i]);
    }
    await insertMenuItemsBatch(chunk);
  }
  await writeJSON(LOCAL_FILES.searchIndex, searchIndex);

  const restaurantsWithHours = Object.keys(hoursData.restaurants).length;

  return {
    restaurantCount: restaurants.length,
    menuItemCount: rawMenuItems.length,
    restaurantsWithHours,
  };
}
