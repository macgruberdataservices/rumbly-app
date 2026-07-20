// Milestone 5 ranking engine. Reads the lazily-loaded search_index.json
// projection (items) plus the already-in-memory restaurants array,
// producing one ranked, mixed result list — matches the search spec's
// "All is a ranked, mixed view — not a raw concatenation of complete
// category lists" principle directly, rather than computing three
// separate category lists and concatenating them. Milestone 6 owns
// splitting this same list into the All/Items/Restaurants/Related tab
// strip; the ranking itself doesn't change per tab.
//
// Deliberately out of scope here (see Docs/ROADMAP.md's open questions
// #3/#4 and the Milestone 6 description): description matching,
// singular/plural and abbreviation normalization, personal-preference
// tie-breaking. Case- and diacritic-insensitivity come from
// normalizeForSearch(); common
// punctuation/apostrophe tolerance comes from tokenizing on
// non-alphanumeric boundaries below.

import type { Restaurant, SearchIndexEntry } from '../data/types';
import { normalizeForSearch } from '../data/diacritics';
import { collectRelatedTags, type RelatedTag } from './relatedTaxonomy';

export type SearchResult =
  | { kind: 'restaurant'; tier: number; restaurant: Restaurant }
  | { kind: 'item'; tier: number; item: SearchIndexEntry; restaurant: Restaurant }
  | { kind: 'related'; tier: number; tag: RelatedTag };

// Lower number = higher priority. Restaurant/item name matches always
// outrank the related-taxonomy pass and restaurant-description matches,
// per the spec's "Name matches must outrank incidental description
// matches" rule.
const TIER = {
  exactRestaurantName: 0,
  exactItemName: 1,
  restaurantNamePrefix: 2,
  itemNamePrefix: 3,
  related: 4,
  restaurantNameSubstring: 5,
  itemNameSubstring: 6,
  restaurantNameFuzzy: 7,
  itemNameFuzzy: 8,
} as const;

// Broad queries (e.g. "chicken") can match hundreds of items — Milestone
// 6 owns the large-result-set UX (category counts, refinement
// suggestions); for now just cap render cost rather than build that here.
const MAX_RESULTS = 200;
const FUZZY_TRIGGER_RESULT_COUNT = 25;

function tokenize(norm: string): string[] {
  return norm.split(/[^a-z0-9]+/).filter(Boolean);
}

function editDistanceWithin(a: string, b: string, maxDistance: number): boolean {
  if (Math.abs(a.length - b.length) > maxDistance) return false;
  let previous = new Array<number>(b.length + 1);
  let current = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) previous[j] = j;

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return false;
    const temp = previous;
    previous = current;
    current = temp;
  }

  return previous[b.length] <= maxDistance;
}

function fuzzyTokenMatch(token: string, q: string, maxDistance: number): boolean {
  const candidate = token.length >= q.length ? token.slice(0, q.length) : token;
  return editDistanceWithin(candidate, q, maxDistance);
}

function fuzzyNameMatch(norm: string, q: string, minQueryLength: number): boolean {
  if (q.length < minQueryLength) return false;
  const maxDistance = q.length >= 7 ? 2 : 1;
  return tokenize(norm).some(
    (token) => token.length >= Math.max(3, q.length - maxDistance) && fuzzyTokenMatch(token, q, maxDistance)
  );
}

// Restaurant names tokenize (cheap — 436 restaurants) so a query like
// "guy" prefix-matches "Chicken Guy!" via its second word, not just the
// start of the full string.
function restaurantNameTier(norm: string, q: string, includeFuzzy: boolean): number | null {
  if (norm === q) return TIER.exactRestaurantName;
  if (norm.startsWith(q) || tokenize(norm).some((t) => t.startsWith(q))) return TIER.restaurantNamePrefix;
  if (norm.includes(q)) return TIER.restaurantNameSubstring;
  if (includeFuzzy && fuzzyNameMatch(norm, q, 4)) return TIER.restaurantNameFuzzy;
  return null;
}

// Item names skip per-token prefix matching on purpose — re-tokenizing
// 45k+ entries on every debounced keystroke is the wrong place to spend
// that cost. Full-string startsWith/includes only, a deliberate scope
// reduction against restaurantNameTier's richer matching.
function itemNameTier(norm: string, q: string, includeFuzzy: boolean): number | null {
  if (norm === q) return TIER.exactItemName;
  if (norm.startsWith(q)) return TIER.itemNamePrefix;
  if (norm.includes(q)) return TIER.itemNameSubstring;
  if (includeFuzzy && fuzzyNameMatch(norm, q, 5)) return TIER.itemNameFuzzy;
  return null;
}

export function resultLabel(r: SearchResult): string {
  if (r.kind === 'restaurant') return r.restaurant.restaurant;
  if (r.kind === 'item') return r.item.item;
  return r.tag.label;
}

export function resultKey(r: SearchResult): string {
  if (r.kind === 'restaurant') return `restaurant:${r.restaurant.restaurant_id}`;
  if (r.kind === 'item') return `item:${r.item.restaurant_id}:${r.item.item_id}`;
  return `related:${r.tag.kind}:${r.tag.value}`;
}

export function search(
  query: string,
  restaurants: Restaurant[],
  searchIndex: SearchIndexEntry[]
): SearchResult[] {
  const q = normalizeForSearch(query).trim();
  if (!q) return [];

  const results: SearchResult[] = [];
  const restaurantById = new Map(restaurants.map((r) => [r.restaurant_id, r]));
  const seenRestaurantIds = new Set<string>();

  for (const r of restaurants) {
    const tier = restaurantNameTier(normalizeForSearch(r.restaurant), q, false);
    if (tier !== null) {
      seenRestaurantIds.add(r.restaurant_id);
      results.push({ kind: 'restaurant', tier, restaurant: r });
    }
  }

  // The same item_id legitimately repeats in search_index.json once per
  // dining_period it's offered at (confirmed on real data: a restaurant
  // dessert served at Breakfast/Lunch/Dinner/Late Night all share one
  // item_id) — a real characteristic of the source data, not a pipeline
  // bug. Without deduping, identical-looking rows pile up in results and
  // collide on React key (restaurant_id + item_id). One row per item is
  // what a search result should show regardless of how many periods it
  // spans; tap-through lands on whichever period this first-seen entry
  // carries, which is always a real period the item is actually served.
  const seenItemKeys = new Set<string>();
  for (const item of searchIndex) {
    if (!item.show_in_menu) continue;
    // A menu item whose restaurant isn't in the passed-in restaurants
    // array is skipped outright, not shown with a null restaurant — this
    // is both a correctness fix (search_index.json can reference a
    // restaurant that's since been hidden/excluded from a rebuild) and
    // what makes Milestone 6's filter sheet work for free: callers filter
    // by passing a narrowed `restaurants` array, and items automatically
    // narrow along with it since there's nothing else gating them.
    const restaurant = restaurantById.get(item.restaurant_id);
    if (!restaurant) continue;
    const itemKey = `${item.restaurant_id}:${item.item_id}`;
    if (seenItemKeys.has(itemKey)) continue;
    const tier = itemNameTier(item._norm, q, false);
    if (tier !== null) {
      seenItemKeys.add(itemKey);
      results.push({ kind: 'item', tier, item, restaurant });
    }
  }

  for (const tag of collectRelatedTags(restaurants)) {
    const norm = normalizeForSearch(tag.label);
    if (norm === q || norm.startsWith(q)) {
      results.push({ kind: 'related', tier: TIER.related, tag });
    }
  }

  // Fuzzy matching is deliberately a fallback, not part of every broad
  // search. Running edit-distance checks against 45k+ item rows on a query
  // that already has plenty of strict matches is both slower and noisier.
  if (results.length < FUZZY_TRIGGER_RESULT_COUNT) {
    for (const r of restaurants) {
      if (seenRestaurantIds.has(r.restaurant_id)) continue;
      if (restaurantNameTier(normalizeForSearch(r.restaurant), q, true) === TIER.restaurantNameFuzzy) {
        seenRestaurantIds.add(r.restaurant_id);
        results.push({ kind: 'restaurant', tier: TIER.restaurantNameFuzzy, restaurant: r });
      }
    }
  }

  if (results.length < FUZZY_TRIGGER_RESULT_COUNT) {
    for (const item of searchIndex) {
      if (!item.show_in_menu) continue;
      const restaurant = restaurantById.get(item.restaurant_id);
      if (!restaurant) continue;
      const itemKey = `${item.restaurant_id}:${item.item_id}`;
      if (seenItemKeys.has(itemKey)) continue;
      if (itemNameTier(item._norm, q, true) === TIER.itemNameFuzzy) {
        seenItemKeys.add(itemKey);
        results.push({ kind: 'item', tier: TIER.itemNameFuzzy, item, restaurant });
        if (results.length >= MAX_RESULTS) break;
      }
    }
  }

  results.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : resultLabel(a).localeCompare(resultLabel(b))));

  return results.slice(0, MAX_RESULTS);
}
