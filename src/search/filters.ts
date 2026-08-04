// Milestone 6 additive filters — state, application, and the option
// lists the bottom filter dock's chips are built from.
//
// Scoped to fields that are clean and restaurant-level, matching the
// search spec's four groups (Location/Food/Dining/Price and personal
// state) only where real data supports it — deliberate reductions, not
// silent gaps:
// - Food group's "Item type"/"Dietary attributes" are per-menu-item
//   fields (is_kids, is_allergy_friendly, etc. on MenuItem), not
//   restaurant-level — no clean restaurant-wide rollup exists yet, so
//   they're left out rather than half-built.
// - Dining group's "Experience"/"Mobile order" would need raw_facets,
//   which the roadmap's 2026-07-19 data-spike deliberately excluded from
//   the Related taxonomy for being duplicative Disney marketing metadata
//   — same reasoning applies here.
// - Price and personal state's item-level Need It/Got It/ratings do not
//   have restaurant-level filters yet — only Love is currently filterable.
//
// Filters combine additively: OR within a group, AND across groups
// (resolved 2026-07-19, see Docs/ROADMAP.md open question #1).

import type { HoursData, MenuItem, Restaurant, SearchIndexEntry } from '../data/types';
import { getTodayStatus } from '../data/hoursStatus';

export interface SearchFilters {
  parks: Set<string>;
  resorts: Set<string>;
  accessibleWithoutAdmission: boolean;
  cuisines: Set<string>;
  mealPeriods: Set<string>;
  serviceTypes: Set<string>;
  priceTiers: Set<number>;
  lovedOnly: boolean;
  // Item-level, unlike every filter above -- see the header comment's
  // dietary-attributes note. The first item-level filter group in the
  // app; ported from Disney Dining Dev's already-shipped allergy
  // filtering (Docs/ROADMAP.md, 2026-07-27 plan) rather than designed
  // from scratch.
  dietary: Set<string>;
}

export function emptyFilters(): SearchFilters {
  return {
    parks: new Set(),
    resorts: new Set(),
    accessibleWithoutAdmission: false,
    cuisines: new Set(),
    mealPeriods: new Set(),
    serviceTypes: new Set(),
    priceTiers: new Set(),
    lovedOnly: false,
    dietary: new Set(),
  };
}

export function countActiveFilters(f: SearchFilters): number {
  return (
    f.parks.size +
    f.resorts.size +
    (f.accessibleWithoutAdmission ? 1 : 0) +
    f.cuisines.size +
    f.mealPeriods.size +
    f.serviceTypes.size +
    f.priceTiers.size +
    (f.lovedOnly ? 1 : 0) +
    f.dietary.size
  );
}

// Ported from Disney Dining Dev's DIETARY_FILTERS/ALLERGEN_FILTER_KEYS
// (Front_End/index.html) -- keys match ALLERGEN_LABEL_MAP in the
// pipeline's normalize_menu.py exactly. Never merge these into a
// combined chip; a narrow, un-merged mapping is what keeps a filter
// selection trustworthy as an allergy claim.
export const DIETARY_FILTERS: { key: string; label: string }[] = [
  { key: 'kids', label: 'Kids menu' },
  { key: 'allergy-friendly', label: 'Allergy-friendly' },
  { key: 'gluten-wheat', label: 'Gluten/Wheat-friendly' },
  { key: 'milk', label: 'Milk-friendly' },
  { key: 'egg', label: 'Egg-friendly' },
  { key: 'soy', label: 'Soy-friendly' },
  { key: 'sesame', label: 'Sesame-friendly' },
  { key: 'peanut', label: 'Peanut-friendly' },
  { key: 'tree-nut', label: 'Tree Nut-friendly' },
  { key: 'fish', label: 'Fish-friendly' },
  { key: 'shellfish', label: 'Shellfish-friendly' },
];

export const ALLERGEN_FILTER_KEYS = [
  'gluten-wheat', 'milk', 'egg', 'soy', 'sesame', 'peanut', 'tree-nut', 'fish', 'shellfish',
] as const;

export const ALLERGEN_LABELS: Record<string, string> = {
  'gluten-wheat': 'Gluten/Wheat', milk: 'Milk', egg: 'Egg', soy: 'Soy',
  sesame: 'Sesame', peanut: 'Peanut', 'tree-nut': 'Tree Nut', fish: 'Fish', shellfish: 'Shellfish',
};

export function hasAllergyDietarySelection(dietary: Set<string>): boolean {
  return dietary.has('allergy-friendly') || ALLERGEN_FILTER_KEYS.some((key) => dietary.has(key));
}

export function withoutAllergyDietarySelections(dietary: Set<string>): Set<string> {
  return new Set(Array.from(dietary).filter((key) => key === 'kids'));
}

// Item-level visibility, safety-critical (Docs/ROADMAP.md, 2026-07-27
// plan): every allergy-related chip (general or allergen-specific) is
// matched ONLY against is_allergy_friendly + the item's own `allergens`
// field -- both directly reflect Disney's own published menu-section
// labeling. `has_allergy_option`/`allergy_free_of` are a *different*,
// inferred signal (a name-match against a sibling item) and must never
// decide what a filter chip includes -- they only back the separate,
// hedged informational badge on regular items (see MenuItemRow.tsx/
// ItemResultRow.tsx).
//
// Dietary selections are the deliberate exception to the app's usual
// OR-within-a-group behavior. Allergy requirements combine with AND semantics:
// an item must carry every Disney-published allergen label the guest selected.
// The general Allergy-friendly chip only widens the set when it is selected by
// itself; it cannot override a specific allergen. Kids + an allergy selection
// means the item must satisfy both requirements.
export function itemMatchesDietary(item: Pick<MenuItem | SearchIndexEntry, 'is_kids' | 'is_allergy_friendly' | 'allergens'>, dietary: Set<string>): boolean {
  const wantsKids = dietary.has('kids');
  const wantsAnyAllergyFriendly = dietary.has('allergy-friendly');
  const requestedAllergens = ALLERGEN_FILTER_KEYS.filter((key) => dietary.has(key));
  const hasAllergySelection = wantsAnyAllergyFriendly || requestedAllergens.length > 0;

  if (wantsKids && !item.is_kids) return false;
  if (!hasAllergySelection) return wantsKids && item.is_kids;
  if (!item.is_allergy_friendly) return false;
  // item.allergens can be undefined on stale locally-cached data
  // predating this field, despite the type -- see LOCAL_DATA_SCHEMA_VERSION
  // 7's comment in manifest.ts. Fails closed (no allergen match) rather
  // than crashing.
  if (requestedAllergens.length === 0) return wantsAnyAllergyFriendly;
  return requestedAllergens.every((allergen) => (item.allergens ?? []).includes(allergen));
}

// The single item-visibility decision for search results (Find only --
// this app's owner decision, 2026-07-27, was to leave a restaurant's own
// menu display unfiltered/unsuppressed). When any dietary chip is
// active, results narrow entirely to matches (Disney's own hidden
// allergy-labeled rows included, bypassing show_in_menu) -- consistent
// with every other filter group narrowing rather than adding. With no
// dietary chip active, ordinary show_in_menu items show as before, with
// allergy-labeled rows additionally suppressed unless
// allowAllergyByDefault (the "All Allergy Friendly in Search" Settings
// toggle, default off) is on -- Disney's allergy-variant rows are ~22% of
// all items and would otherwise overwhelm unfiltered results.
export function itemVisibleInSearch(
  item: Pick<MenuItem | SearchIndexEntry, 'is_kids' | 'is_allergy_friendly' | 'allergens' | 'show_in_menu'>,
  dietary: Set<string>,
  allowAllergyByDefault: boolean
): boolean {
  if (dietary.size > 0) return itemMatchesDietary(item, dietary);
  // Checked before show_in_menu, not after -- Disney's allergy-labeled
  // rows are always show_in_menu:false (they're a separate, normally-
  // suppressed published row), so a plain "!show_in_menu -> hide" check
  // would block them even with the toggle on and silently make the
  // toggle a no-op. allowAllergyByDefault is the deciding factor for
  // these rows specifically; show_in_menu only governs everything else.
  if (item.is_allergy_friendly) return allowAllergyByDefault;
  if (!item.show_in_menu) return false;
  return true;
}

// The item-visibility decision for a restaurant's own menu display
// (RestaurantDetailScreen -- shared by both the native and JS rendering
// paths, since they're both fed the one `sections` list it builds).
// Unlike itemVisibleInSearch, there's no dietary-chip narrowing here, a
// restaurant's menu doesn't have those. show_in_menu already suppresses
// ordinary allergy-variant dupe rows at a normal restaurant (see
// normalize_menu.py's process()), so showAllergyFriendlyMenuItems has no
// effect there. It only matters for the rare restaurant whose entire
// menu IS allergy-friendly categories with no base items to defer to
// (normalize_menu.py's unsuppress_allergy_only_restaurants() leaves
// those show_in_menu:true rather than showing an empty menu) -- the
// "Show Allergy Friendly Menu Items" Settings toggle (default off)
// decides whether those show up here.
export function itemVisibleInMenu(
  item: Pick<MenuItem, 'is_allergy_friendly' | 'show_in_menu'>,
  showAllergyFriendlyMenuItems: boolean
): boolean {
  if (!item.show_in_menu) return false;
  if (item.is_allergy_friendly) return showAllergyFriendlyMenuItems;
  return true;
}

export interface FilterOptions {
  parks: string[];
  resorts: string[];
  cuisines: string[];
  mealPeriods: string[];
  serviceTypes: string[];
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function collectFilterOptions(restaurants: Restaurant[]): FilterOptions {
  const parks = new Set<string>();
  const resorts = new Set<string>();
  const cuisines = new Set<string>();
  const mealPeriods = new Set<string>();
  const serviceTypes = new Set<string>();

  for (const r of restaurants) {
    if (r.park) parks.add(r.park);
    if (r.resort) resorts.add(r.resort);
    for (const c of r.cuisine_tags) cuisines.add(c);
    for (const p of r.meal_periods) mealPeriods.add(p);
    if (r.experience_type) serviceTypes.add(r.experience_type);
  }

  return {
    parks: Array.from(parks).sort(),
    resorts: Array.from(resorts).sort(),
    cuisines: Array.from(cuisines).sort(),
    mealPeriods: Array.from(mealPeriods).sort(),
    serviceTypes: Array.from(serviceTypes).sort(),
  };
}

export function cuisineLabel(tag: string): string {
  return titleCase(tag);
}

export function applyFilters(
  restaurants: Restaurant[],
  filters: SearchFilters,
  lovedIds: Set<string>,
  openNow: boolean,
  hoursData: HoursData | null
): Restaurant[] {
  if (countActiveFilters(filters) === 0 && !openNow) return restaurants;

  return restaurants.filter((r) => {
    if (filters.parks.size && !(r.park && filters.parks.has(r.park))) return false;
    if (filters.resorts.size && !(r.resort && filters.resorts.has(r.resort))) return false;
    if (filters.accessibleWithoutAdmission && r.admission_required !== false) return false;
    if (filters.cuisines.size && !r.cuisine_tags.some((c) => filters.cuisines.has(c))) return false;
    if (filters.mealPeriods.size && !r.meal_periods.some((p) => filters.mealPeriods.has(p))) return false;
    if (filters.serviceTypes.size && !(r.experience_type && filters.serviceTypes.has(r.experience_type))) {
      return false;
    }
    if (filters.priceTiers.size && !(r.price_tier !== null && filters.priceTiers.has(r.price_tier))) return false;
    if (filters.lovedOnly && !lovedIds.has(r.restaurant_id)) return false;
    if (openNow && getTodayStatus(hoursData, r.restaurant_id).kind !== 'open') return false;
    return true;
  });
}
