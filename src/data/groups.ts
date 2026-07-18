// Simple top-level grouping for Milestone 1's basic browse screen —
// deliberately NOT the source app's full park/area/resort breadcrumb
// hierarchy (showAreaList/showResortList/showRestaurantListByResort),
// which is out of scope until a later milestone. Just enough grouping to
// prove the offline data pipeline renders something real and useful.

import type { Restaurant } from './types';

const PARK_ORDER = [
  'Magic Kingdom Park',
  'EPCOT',
  "Disney's Hollywood Studios",
  "Disney's Animal Kingdom Theme Park",
];

export interface RestaurantGroup {
  key: string;
  label: string;
  restaurants: Restaurant[];
}

function groupKeyFor(r: Restaurant): string {
  if (r.park) return r.park;
  if (r.resort) return 'Disney Resorts';
  return 'Other';
}

export function groupRestaurants(restaurants: Restaurant[]): RestaurantGroup[] {
  const byKey = new Map<string, Restaurant[]>();
  for (const r of restaurants) {
    const key = groupKeyFor(r);
    const list = byKey.get(key);
    if (list) {
      list.push(r);
    } else {
      byKey.set(key, [r]);
    }
  }

  const groups = Array.from(byKey.entries()).map(([key, list]) => ({
    key,
    label: key,
    restaurants: list.sort((a, b) => a.restaurant.localeCompare(b.restaurant)),
  }));

  groups.sort((a, b) => {
    const ai = PARK_ORDER.indexOf(a.key);
    const bi = PARK_ORDER.indexOf(b.key);
    const aOrder = ai === -1 ? PARK_ORDER.length + (a.key === 'Disney Resorts' ? 0 : 1) : ai;
    const bOrder = bi === -1 ? PARK_ORDER.length + (b.key === 'Disney Resorts' ? 0 : 1) : bi;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.label.localeCompare(b.label);
  });

  return groups;
}
