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
import {
  shouldImportMainRestaurant,
  visibleRestaurantMenuItems,
} from './restaurantVisibility';

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
// these 12 restaurant_ids (2026-07-23) -- covers every hand-coded entry
// that exists today. A newly hand-coded venue not listed here falls back
// to its own (likely non-canonical) park/area/resort strings; fix at the
// source (hand_coded_venues.json) if this keeps recurring.
//
// Was 13: energy-bytes dropped 2026-08-11 when Disney finally published a
// real facility for it (411901863) and graduate_hand_coded.py retired
// HANDCODE.010, keeping the slug. It now arrives as an ordinary main-feed
// record carrying Magic Kingdom Park/Tomorrowland itself, and this table is
// only consulted for records from hand_coded_data.json -- so the entry had
// become unreachable. Anything graduated this way belongs out of here, or
// the next reader takes the list as the current roster of hand-coded venues.
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
    // allergens/allergy_free_of predate hand-coded data's own schema and
    // may simply be absent on these records -- default to empty rather
    // than let `undefined` reach db.ts's json()/JSON.stringify.
    allergens: item.allergens ?? [],
    allergy_free_of: item.allergy_free_of ?? [],
  };
}

// Manually verified 2026-07-27 (owner + agent, one restaurant at a time
// via disneyfoodblog.com's embedded official links, then each URL
// confirmed live against disneyworld.disney.go.com itself before being
// added here): the published restaurant_data.json's own disney_url is
// null for these 36 restaurant_ids even though a real Disney dining page
// exists.
//
// Was 37: tylers-coffee-bar dropped 2026-08-11. Disney's own facility
// description reads "Tyler's Coffee Bar at Golden Oak" (its media lives under
// parks-global-assets/golden-oak/), so it is a private residential community's
// cafe, not a Disney Springs venue -- excluded upstream as off-property, the
// same call already made for Capa and Ravello at the Four Seasons in that same
// community. Its override URL was the one Disney-Springs-shaped thing left
// asserting otherwise. This is a Rumbly-local override, not a fix at the pipeline
// source (Disney Dining Dev's backend, which also feeds the PWA) -- an
// owner decision, so the PWA doesn't pick this up and a future upstream
// fix wouldn't conflict with it (this only fills a null, never
// overwrites a real published value). 11 restaurants remain genuinely
// unresolved as of this date; see Docs/ROADMAP.md for the full list.
const DISNEY_URL_OVERRIDES: Record<string, string> = {
  'boardwalk-pizza-window': 'https://disneyworld.disney.go.com/dining/boardwalk/pizza-window/',
  'stk-orlando': 'https://disneyworld.disney.go.com/dining/disney-springs/stk-steakhouse/',
  'stargazers-bar': 'https://disneyworld.disney.go.com/dining/disney-springs/stargazers-bar/',
  'boardwalk-ice-cream': 'https://disneyworld.disney.go.com/dining/boardwalk/boardwalk-ice-cream/',
  'summer-house': 'https://disneyworld.disney.go.com/dining/disney-springs/summer-house-on-the-lake/',
  'macguffins': 'https://disneyworld.disney.go.com/dining/disney-springs/macguffins/',
  'six-ravens---coming-soon': 'https://disneyworld.disney.go.com/dining/disney-springs/six-ravens/',
  'terralina': 'https://disneyworld.disney.go.com/dining/disney-springs/terralina-crafted-italian/',
  'homecomin': 'https://disneyworld.disney.go.com/dining/disney-springs/chef-art-smiths-homecomin/',
  'goofys-candy-company': 'https://disneyworld.disney.go.com/dining/disney-springs/goofys-candy-company/',
  'the-ganachery': 'https://disneyworld.disney.go.com/dining/disney-springs/the-ganachery/',
  'level99': 'https://disneyworld.disney.go.com/dining/disney-springs/level99/',
  'morimoto-street-food': 'https://disneyworld.disney.go.com/dining/disney-springs/morimoto-asia-street-food/',
  'raglan-road': 'https://disneyworld.disney.go.com/dining/disney-springs/raglan-road-irish-pub-and-restaurant/',
  'funnel-cake-cart---temporarily-unavailable': 'https://disneyworld.disney.go.com/dining/boardwalk/funnel-cake-cart/',
  'boardwalk-joes': 'https://disneyworld.disney.go.com/dining/boardwalk/boardwalk-joes-marvelous-margaritas/',
  'blaze-fast-fired-pizza': 'https://disneyworld.disney.go.com/dining/disney-springs/blaze-pizza/',
  'the-cake-bake-shop-restaurant-by-gwendolyn-rogers': 'https://disneyworld.disney.go.com/dining/boardwalk/cake-bake-shop-restaurant/',
  'house-of-blues': 'https://disneyworld.disney.go.com/dining/disney-springs/house-of-blues-restaurant/',
  'haagen-dazs': 'https://disneyworld.disney.go.com/dining/disney-springs/haagen-dazs-west-side/',
  'everglazed': 'https://disneyworld.disney.go.com/dining/disney-springs/everglazed-donuts/',
  'wetzels-pretzels': 'https://disneyworld.disney.go.com/dining/disney-springs/wetzels-pretzels-west-side/',
  'city-works-eatery-and-pour-house': 'https://disneyworld.disney.go.com/dining/disney-springs/city-works/',
  'lava-lounge-at-rainforest-café': 'https://disneyworld.disney.go.com/dining/disney-springs/lava-lounge/',
  'wolfgang-puck-bar-grill': 'https://disneyworld.disney.go.com/dining/disney-springs/wolfgang-puck-bar-and-grill/',
  'sunshine-churros-marketplace': 'https://disneyworld.disney.go.com/dining/disney-springs/sunshine-churros-marketplace/',
  'sunshine-churros-west-side': 'https://disneyworld.disney.go.com/dining/disney-springs/sunshine-churros-west-side/',
  'paradiso-37': 'https://disneyworld.disney.go.com/dining/disney-springs/paradiso-37-taste-of-the-americas/',
  'bbwolfs': 'https://disneyworld.disney.go.com/dining/disney-springs/bb-wolfs-sausage-co/',
  'starbucks-marketplace': 'https://disneyworld.disney.go.com/dining/disney-springs/starbucks-at-marketplace/',
  'ghirardelli-soda-fountain-and-chocolate-shop': 'https://disneyworld.disney.go.com/dining/disney-springs/ghirardelli-soda-fountain/',
  'planet-hollywood': 'https://disneyworld.disney.go.com/dining/disney-springs/planet-hollywood-observatory/',
  'the-front-porch-at-house-of-blues': 'https://disneyworld.disney.go.com/dining/disney-springs/front-porch-bar-at-house-of-blues-restaurant/',
  'espn-wide-world-of-sports-grill': 'https://disneyworld.disney.go.com/dining/wide-world-of-sports/espn-wide-world-sports-grill/',
  'the-edison': 'https://disneyworld.disney.go.com/dining/disney-springs/edison/',
  'the-boathouse': 'https://disneyworld.disney.go.com/dining/disney-springs/boathouse-restaurant/',
};

function applyDisneyUrlOverrides(restaurants: Restaurant[]): Restaurant[] {
  return restaurants.map((r) => {
    const override = DISNEY_URL_OVERRIDES[r.restaurant_id];
    return override && !r.disney_url ? { ...r, disney_url: override } : r;
  });
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

  // Reject stale pre-split HANDCODE records from the main feed. The
  // independent hand-coded feed below is their sole authority; accepting
  // both is what let an old visible placeholder survive beside Disney's
  // newly discovered replacement. The Map still de-dupes ordinary main
  // records by restaurant_id.
  const byId = new Map<string, Restaurant>();
  for (const r of rawRestaurants) {
    if (shouldImportMainRestaurant(r)) byId.set(r.restaurant_id, r);
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
  const restaurants = applyDisneyUrlOverrides(Array.from(byId.values()));
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
  const visibleRestaurantIds = new Set(byId.keys());
  const visibleMainMenuItems = visibleRestaurantMenuItems(
    rawMenuItems,
    visibleRestaurantIds
  );
  const menuItems = visibleMainMenuItems.concat(visibleHandCodedMenuItems);

  // Deduplicate here, at write time, rather than on every cold start.
  // menu_data + hand_coded_menu_data together carry a lot of repeated
  // restaurant_id:item_id pairs -- measured 2026-08-11 against the live
  // feed: 46,344 rows in, 31,321 unique, so ~32% of the file was duplicate
  // rows that searchIndexLoader.prepareSearchIndex() re-derived and threw
  // away on the JS thread at every launch. Writing the deduped set makes
  // search_index.json ~32% smaller, which is ~32% off the launch JSON.parse.
  // Keep-first here matches prepareSearchIndex()'s keep-first semantics, so
  // which row survives is unchanged; that loader stays in place as-is for
  // installs still holding a pre-dedupe file from an earlier import.
  const searchIndex: SearchIndexEntry[] = [];
  const seenIndexKeys = new Set<string>();
  await clearMenuItems();
  for (let start = 0; start < menuItems.length; start += INSERT_CHUNK_SIZE) {
    const chunk = menuItems.slice(start, start + INSERT_CHUNK_SIZE);
    for (let i = 0; i < chunk.length; i++) {
      const item = chunk[i];
      const key = `${item.restaurant_id}:${item.item_id}`;
      if (seenIndexKeys.has(key)) continue;
      seenIndexKeys.add(key);
      searchIndex.push(toSearchIndexEntry(item));
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
