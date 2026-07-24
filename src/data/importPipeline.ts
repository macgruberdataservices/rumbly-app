// Ported from Disney Dining Dev's importFreshData(): fetches the three
// content-hashed files named in a manifest and stores them per the same
// split as the source app — restaurants/hours/search-index as in-memory-
// sized blobs (fileStore.ts), full menu item records indexed on demand
// (db.ts). menu_data.json is parsed once and walked once (not twice) to
// build both the SQLite insert batch and the SEARCH_INDEX projection
// together, since re-scanning a 45k-item array twice is pure waste.
//
// hand_coded_data/hand_coded_menu_data (Disney Dining Dev's pipeline for
// venues with no real Disney facility id — permanent stands/carts absent
// from Disney's own enumeration) started publishing on the live manifest
// 2026-07-21; this port originally predated that and skipped them
// entirely (found via a live-data audit 2026-07-23, flagged in
// Docs/ROADMAP.md). A missing key on an older cached manifest is still
// treated as "nothing published yet," same as the source PWA.

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

async function fetchOptionalJSON<T>(fileName: string | undefined, fallback: T): Promise<T> {
  if (!fileName) return fallback;
  return fetchJSON<T>(fileName);
}

// hand_coded_venues.json records park/area/resort in casual shorthand
// ("Hollywood Studios", "Magic Kingdom", "Contemporary Resort" as a
// park), not the exact canonical strings groupKeyFor()/PARK_LABELS
// (locationNames.ts) key off of ("Disney's Hollywood Studios", "Magic
// Kingdom Park", park:null+resort:"Disney's Contemporary Resort"). Found
// 2026-07-23: that mismatch was producing duplicate/stray Explore-by-
// Location cards -- a mismatched park string either creates a second
// card with the same display label as the real one (parkDisplayName()
// has no entry for the shorthand, so it falls back to displaying it
// verbatim, which for "Hollywood Studios" happens to collide with the
// canonical park's own display label) or, for a resort/Disney Springs
// venue recorded with a park-shaped value that isn't really a park at
// all, an extra card of its own instead of folding into "Disney Resorts"
// or "Disney Springs" the way the real data does.
// Hand-verified against the live main-feed's own values for each of
// these 13 restaurant_ids (2026-07-23) -- covers every hand-coded entry
// that exists today. A newly hand-coded venue not listed here falls back
// to its own (likely non-canonical) park/area/resort strings; fix at the
// source (hand_coded_venues.json) if this keeps recurring.
const HAND_CODED_LOCATION_OVERRIDES: Record<
  string,
  { park: string | null; area: string | null; resort: string | null }
> = {
  'dinosaur-gerties-ice-cream-of-extinction': { park: "Disney's Hollywood Studios", area: 'Echo Lake', resort: null },
  'high-dry': { park: "Disney's Typhoon Lagoon Water Park", area: null, resort: null },
  'oasis-canteen': { park: "Disney's Hollywood Studios", area: 'Echo Lake', resort: null },
  'promenade-refreshments': { park: 'EPCOT', area: 'World Showcase', resort: null },
  'peevys-polar-pipeline': { park: "Disney's Hollywood Studios", area: null, resort: null },
  'egg-roll-wagon': { park: 'Magic Kingdom Park', area: 'Adventureland', resort: null },
  'pretzel-palooza': { park: "Disney's Hollywood Studios", area: 'Sunset Boulevard', resort: null },
  'boardwalk-snacks': { park: null, area: 'EPCOT Resort Area', resort: "Disney's BoardWalk Inn" },
  'garden-house': { park: 'EPCOT', area: 'World Showcase', resort: null },
  'energy-bytes': { park: 'Magic Kingdom Park', area: 'Tomorrowland', resort: null },
  'regal-eagle-smokehouse-outdoor-bar': { park: 'EPCOT', area: 'World Showcase', resort: null },
  'paddys-bar': { park: null, area: 'The Landing', resort: null },
  'california-grill-lounge': { park: null, area: 'Magic Kingdom Resort Area', resort: "Disney's Contemporary Resort" },
};

// A live-data audit 2026-07-23 found hand_coded_data.json records missing
// a few fields the published restaurant_data.json schema always includes
// (is_festival_booth/festival_name/festival_year) -- default them rather
// than let `undefined` flow into code that expects the Restaurant type's
// real booleans/nulls. Also applies the location override above so every
// hand-coded record — whether it ends up filling gaps in an existing
// restaurant or standing on its own — carries canonical location strings.
function normalizeHandCodedRestaurant(r: Restaurant): Restaurant {
  const location = HAND_CODED_LOCATION_OVERRIDES[r.restaurant_id];
  return {
    ...r,
    is_festival_booth: r.is_festival_booth ?? false,
    festival_name: r.festival_name ?? null,
    festival_year: r.festival_year ?? null,
    park: location ? location.park : r.park,
    area: location ? location.area : r.area,
    resort: location ? location.resort : r.resort,
  };
}

// Same audit found hand_coded_menu_data.json publishing price_changed as
// `false` (boolean) instead of the date-string-or-null every other menu
// item uses.
function normalizeHandCodedMenuItem(item: MenuItem): MenuItem {
  return {
    ...item,
    price_changed: typeof item.price_changed === 'string' ? item.price_changed : null,
  };
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
    first_seen: item.first_seen,
    description: item.description,
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
  const [rawRestaurants, hoursData, rawHandCodedRestaurants] = await Promise.all([
    fetchJSON<Restaurant[]>(manifest.restaurant_data),
    fetchJSON<HoursData>(manifest.hours_data),
    fetchOptionalJSON<Restaurant[]>(manifest.hand_coded_data, []),
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
  // Hand-coded venues merge into the same restaurant_id-keyed map. Two
  // different cases, found while investigating a 2026-07-23 "these are
  // grouping into Other despite having area recorded" report:
  //
  // - restaurant_id already resolved to a visible main-feed record (10 of
  //   13 hand-coded venues have since been picked up for real by Disney's
  //   own facility feed under the same id — "graduated"). Visibility is
  //   already decided; the hand-coded record's only remaining job is
  //   filling in park/area/resort the main feed's stale pre-split copy
  //   still has as null (build_hand_coded_data.py's own docstring
  //   documents this exact upstream bug). This must happen regardless of
  //   the hand-coded record's own show_in_app — that flag describes
  //   whether the standalone hand-coded placeholder should render on its
  //   own, not whether its data should backfill an already-visible record
  //   it now duplicates. Only fills fields the main record has as null,
  //   so a real, already-populated main-feed value always wins.
  // - No existing record — a genuine hand-coded-only venue not in the
  //   main feed at all. Its own show_in_app gates whether it appears,
  //   same as before.
  for (const raw of rawHandCodedRestaurants) {
    const r = normalizeHandCodedRestaurant(raw);
    const existing = byId.get(r.restaurant_id);
    if (existing) {
      byId.set(r.restaurant_id, {
        ...existing,
        park: existing.park ?? r.park,
        area: existing.area ?? r.area,
        resort: existing.resort ?? r.resort,
      });
    } else if (r.show_in_app) {
      byId.set(r.restaurant_id, r);
    }
  }
  const restaurants = Array.from(byId.values());
  await writeJSON(LOCAL_FILES.restaurantData, restaurants);
  await writeJSON(LOCAL_FILES.hoursData, hoursData);

  const [rawMenuItems, rawHandCodedMenuItems] = await Promise.all([
    fetchJSON<MenuItem[]>(manifest.menu_data),
    fetchOptionalJSON<MenuItem[]>(manifest.hand_coded_menu_data, []),
  ]);

  // Gate hand-coded menu items on their parent venue actually having made
  // it into `restaurants` above. Most hand-coded venues are recorded
  // placeholders with show_in_app:false, so most of their menu items
  // don't belong in search/detail yet either — the source PWA's own
  // equivalent merge is missing exactly this gate (found via the same
  // 2026-07-23 audit), which ships every one of its hand-coded items into
  // search orphaned (no matching restaurant record: blank name/location,
  // and tapping one silently no-ops). Don't repeat that bug here.
  const visibleHandCodedMenuItems = rawHandCodedMenuItems
    .filter((item) => byId.has(item.restaurant_id))
    .map(normalizeHandCodedMenuItem);
  const menuItems = rawMenuItems.concat(visibleHandCodedMenuItems);

  const searchIndex: SearchIndexEntry[] = new Array(menuItems.length);
  await clearMenuItems();
  for (let start = 0; start < menuItems.length; start += INSERT_CHUNK_SIZE) {
    const chunk = menuItems.slice(start, start + INSERT_CHUNK_SIZE);
    for (let i = 0; i < chunk.length; i++) {
      searchIndex[start + i] = toSearchIndexEntry(chunk[i]);
    }
    await insertMenuItemsBatch(chunk);
  }
  await writeJSON(LOCAL_FILES.searchIndex, searchIndex);

  const restaurantsWithHours = Object.keys(hoursData.restaurants).length;

  return {
    restaurantCount: restaurants.length,
    menuItemCount: menuItems.length,
    restaurantsWithHours,
  };
}
