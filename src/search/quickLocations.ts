import type { Restaurant } from '../data/types';
import { DISNEY_SPRINGS_AREAS, WATER_PARK_ORDER, areaDisplayName, parkDisplayName } from '../data/locationNames';

export type QuickLocationKey =
  | 'magic_kingdom'
  | 'epcot'
  | 'hollywood_studios'
  | 'animal_kingdom'
  | 'resorts'
  | 'disney_springs'
  | 'water_parks';

export const QUICK_LOCATIONS: Array<{ key: QuickLocationKey; label: string }> = [
  { key: 'magic_kingdom', label: 'Magic Kingdom' },
  { key: 'epcot', label: 'EPCOT' },
  { key: 'hollywood_studios', label: 'Hollywood Studios' },
  { key: 'animal_kingdom', label: 'Animal Kingdom' },
  { key: 'resorts', label: 'Resorts' },
  { key: 'disney_springs', label: 'Disney Springs' },
  { key: 'water_parks', label: 'Water Parks' },
];

const PARK_BY_KEY: Partial<Record<QuickLocationKey, string>> = {
  magic_kingdom: 'Magic Kingdom Park',
  epcot: 'EPCOT',
  hollywood_studios: "Disney's Hollywood Studios",
  animal_kingdom: "Disney's Animal Kingdom Theme Park",
};
const WATER_PARKS = new Set(WATER_PARK_ORDER);

type QuickLocationDetailKind = 'area' | 'resort' | 'park';

export interface QuickLocationDetail {
  key: string;
  parent: QuickLocationKey;
  label: string;
  kind: QuickLocationDetailKind;
  value: string;
}

export interface QuickLocationDetailGroup {
  key: QuickLocationKey;
  label: string;
  options: QuickLocationDetail[];
}

function detailKey(parent: QuickLocationKey, kind: QuickLocationDetailKind, value: string): string {
  return `${parent}:${kind}:${value}`;
}

function matchesQuickLocation(restaurant: Restaurant, key: QuickLocationKey): boolean {
  const park = PARK_BY_KEY[key];
  if (park) return restaurant.park === park;
  if (key === 'resorts') return restaurant.resort !== null;
  if (key === 'disney_springs') return restaurant.area !== null && DISNEY_SPRINGS_AREAS.has(restaurant.area);
  return restaurant.park !== null && WATER_PARKS.has(restaurant.park);
}

function detailForRestaurant(
  restaurant: Restaurant,
  parent: QuickLocationKey
): Omit<QuickLocationDetail, 'key' | 'parent'> | null {
  if (parent === 'resorts') {
    return restaurant.resort ? { label: restaurant.resort, kind: 'resort', value: restaurant.resort } : null;
  }
  if (parent === 'water_parks') {
    return restaurant.park ? { label: parkDisplayName(restaurant.park), kind: 'park', value: restaurant.park } : null;
  }
  return restaurant.area ? { label: areaDisplayName(restaurant.area), kind: 'area', value: restaurant.area } : null;
}

function matchesDetail(restaurant: Restaurant, detail: QuickLocationDetail): boolean {
  if (detail.kind === 'resort') return restaurant.resort === detail.value;
  if (detail.kind === 'park') return restaurant.park === detail.value;
  return restaurant.area === detail.value;
}

export function collectQuickLocationDetailGroups(
  restaurants: Restaurant[],
  locations: Set<QuickLocationKey>
): QuickLocationDetailGroup[] {
  return QUICK_LOCATIONS.filter((location) => locations.has(location.key)).map((location) => {
    const byKey = new Map<string, QuickLocationDetail>();
    for (const restaurant of restaurants) {
      if (!matchesQuickLocation(restaurant, location.key)) continue;
      const detail = detailForRestaurant(restaurant, location.key);
      if (!detail) continue;
      const key = detailKey(location.key, detail.kind, detail.value);
      byKey.set(key, { key, parent: location.key, ...detail });
    }
    return {
      key: location.key,
      label: location.label,
      options: [...byKey.values()].sort((left, right) => left.label.localeCompare(right.label)),
    };
  });
}

export function applyQuickLocationFilters(
  restaurants: Restaurant[],
  locations: Set<QuickLocationKey>,
  selectedDetails: Set<string>
): Restaurant[] {
  if (locations.size === 0) return restaurants;
  const activeLocations = [...locations];
  const detailGroups = collectQuickLocationDetailGroups(restaurants, locations);
  const selectedByParent = new Map<QuickLocationKey, QuickLocationDetail[]>();
  for (const group of detailGroups) {
    selectedByParent.set(group.key, group.options.filter((option) => selectedDetails.has(option.key)));
  }

  return restaurants.filter((restaurant) => activeLocations.some((location) => {
    if (!matchesQuickLocation(restaurant, location)) return false;
    const details = selectedByParent.get(location) ?? [];
    return details.length === 0 || details.some((detail) => matchesDetail(restaurant, detail));
  }));
}
