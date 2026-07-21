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

import type { HoursData, Restaurant } from '../data/types';
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
    (f.lovedOnly ? 1 : 0)
  );
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
