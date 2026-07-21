// Simple top-level grouping for Milestone 1's basic browse screen —
// deliberately NOT the source app's full park/area/resort breadcrumb
// hierarchy (showAreaList/showResortList/showRestaurantListByResort),
// which is out of scope until a later milestone. Just enough grouping to
// prove the offline data pipeline renders something real and useful.

import type { Restaurant } from './types';
import { distanceToRestaurant, type Coordinates } from '../location/proximity';

const PARK_ORDER = [
  'Magic Kingdom Park',
  'EPCOT',
  "Disney's Hollywood Studios",
  "Disney's Animal Kingdom Theme Park",
];

const DISNEY_SPRINGS_AREAS = new Set(['The Landing', 'West Side', 'Marketplace', 'Town Center']);
const WATER_PARK_ORDER = ["Disney's Blizzard Beach Water Park", "Disney's Typhoon Lagoon Water Park"];

export const WATER_PARKS_GROUP_KEY = 'Water Parks';

const BROWSE_FALLBACK_ORDER = ['Disney Springs', 'Disney Resorts', WATER_PARKS_GROUP_KEY, 'Other'];

export interface RestaurantGroup {
  key: string;
  label: string;
  restaurants: Restaurant[];
}

function compareDistance(a: Restaurant, b: Restaurant, origin: Coordinates): number {
  const aDistance = distanceToRestaurant(origin, a) ?? Number.POSITIVE_INFINITY;
  const bDistance = distanceToRestaurant(origin, b) ?? Number.POSITIVE_INFINITY;
  if (aDistance === bDistance) return 0;
  return aDistance - bDistance;
}

function groupKeyFor(r: Restaurant): string {
  if (r.park && WATER_PARK_ORDER.includes(r.park)) return WATER_PARKS_GROUP_KEY;
  if (r.park) return r.park;
  if (r.resort) return 'Disney Resorts';
  if (r.area && DISNEY_SPRINGS_AREAS.has(r.area)) return 'Disney Springs';
  return 'Other';
}

function topLevelOrderFor(key: string): number {
  const parkIndex = PARK_ORDER.indexOf(key);
  if (parkIndex !== -1) return parkIndex;
  const fallbackIndex = BROWSE_FALLBACK_ORDER.indexOf(key);
  if (fallbackIndex !== -1) return PARK_ORDER.length + fallbackIndex;
  return PARK_ORDER.length + BROWSE_FALLBACK_ORDER.length;
}

function groupRestaurantsByKey(
  restaurants: Restaurant[],
  keyForRestaurant: (restaurant: Restaurant) => string | null,
  origin: Coordinates | null
): RestaurantGroup[] {
  const byKey = new Map<string, Restaurant[]>();
  for (const r of restaurants) {
    const key = keyForRestaurant(r);
    if (!key) continue;
    const list = byKey.get(key);
    if (list) {
      list.push(r);
    } else {
      byKey.set(key, [r]);
    }
  }

  return Array.from(byKey.entries()).map(([key, list]) => ({
    key,
    label: key,
    restaurants: list.sort((a, b) => {
      if (origin) {
        const distanceComparison = compareDistance(a, b, origin);
        if (distanceComparison !== 0) return distanceComparison;
      }
      return a.restaurant.localeCompare(b.restaurant);
    }),
  }));
}

export function groupRestaurants(restaurants: Restaurant[], origin: Coordinates | null = null): RestaurantGroup[] {
  const groups = groupRestaurantsByKey(restaurants, groupKeyFor, origin);

  groups.sort((a, b) => {
    if (origin) {
      const distanceComparison = compareDistance(a.restaurants[0], b.restaurants[0], origin);
      if (distanceComparison !== 0) return distanceComparison;
    }
    const aOrder = topLevelOrderFor(a.key);
    const bOrder = topLevelOrderFor(b.key);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.label.localeCompare(b.label);
  });

  return groups;
}

export function groupWaterParkRestaurants(
  restaurants: Restaurant[],
  origin: Coordinates | null = null
): RestaurantGroup[] {
  const groups = groupRestaurantsByKey(
    restaurants,
    (restaurant) => (restaurant.park && WATER_PARK_ORDER.includes(restaurant.park) ? restaurant.park : null),
    origin
  );

  groups.sort((a, b) => {
    const ai = WATER_PARK_ORDER.indexOf(a.key);
    const bi = WATER_PARK_ORDER.indexOf(b.key);
    if (ai !== bi) return ai - bi;
    return a.label.localeCompare(b.label);
  });

  return groups;
}

export function findRestaurantGroup(
  restaurants: Restaurant[],
  groupKey: string,
  origin: Coordinates | null = null
): RestaurantGroup | undefined {
  return (
    groupRestaurants(restaurants, origin).find((group) => group.key === groupKey) ??
    groupWaterParkRestaurants(restaurants, origin).find((group) => group.key === groupKey)
  );
}
