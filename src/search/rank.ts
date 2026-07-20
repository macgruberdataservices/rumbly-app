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
// #3/#4 and the Milestone 6 description): menu-item description
// matching, fuzzy/typo-tolerant matching, singular/plural and
// abbreviation normalization, personal-preference tie-breaking. Case- and
// diacritic-insensitivity come from normalizeForSearch(); common
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
  restaurantDescription: 7,
} as const;

// Broad queries (e.g. "chicken") can match hundreds of items — Milestone
// 6 owns the large-result-set UX (category counts, refinement
// suggestions); for now just cap render cost rather than build that here.
const MAX_RESULTS = 200;

function tokenize(norm: string): string[] {
  return norm.split(/[^a-z0-9]+/).filter(Boolean);
}

// Restaurant names tokenize (cheap — 436 restaurants) so a query like
// "guy" prefix-matches "Chicken Guy!" via its second word, not just the
// start of the full string.
function restaurantNameTier(norm: string, q: string): number | null {
  if (norm === q) return TIER.exactRestaurantName;
  if (norm.startsWith(q) || tokenize(norm).some((t) => t.startsWith(q))) return TIER.restaurantNamePrefix;
  if (norm.includes(q)) return TIER.restaurantNameSubstring;
  return null;
}

// Item names skip per-token prefix matching on purpose — re-tokenizing
// 45k+ entries on every debounced keystroke is the wrong place to spend
// that cost. Full-string startsWith/includes only, a deliberate scope
// reduction against restaurantNameTier's richer matching.
function itemNameTier(norm: string, q: string): number | null {
  if (norm === q) return TIER.exactItemName;
  if (norm.startsWith(q)) return TIER.itemNamePrefix;
  if (norm.includes(q)) return TIER.itemNameSubstring;
  return null;
}

function resultLabel(r: SearchResult): string {
  if (r.kind === 'restaurant') return r.restaurant.restaurant;
  if (r.kind === 'item') return r.item.item;
  return r.tag.label;
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

  for (const r of restaurants) {
    const tier = restaurantNameTier(normalizeForSearch(r.restaurant), q);
    if (tier !== null) {
      results.push({ kind: 'restaurant', tier, restaurant: r });
    } else if (r.description && normalizeForSearch(r.description).includes(q)) {
      results.push({ kind: 'restaurant', tier: TIER.restaurantDescription, restaurant: r });
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
    const tier = itemNameTier(item._norm, q);
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

  results.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : resultLabel(a).localeCompare(resultLabel(b))));

  return results.slice(0, MAX_RESULTS);
}
