// Groups search results by location for the Find results list, per
// owner direction (2026-07-20): restaurants shown before items, each
// grouped by park, with match quality taking priority before park/resort
// area inside each park bucket. When Near Me has foreground coordinates,
// the same rows use local straight-line distance to Disney guest entrances
// to order location buckets and comparable results. Related-taxonomy
// results aren't location-bound, so they pass through ungrouped at the end.
//
// Bucket taxonomy confirmed against real published data (436 restaurants,
// 2026-07-20): the 4 PARK_ORDER theme parks and both water parks are
// each their own `restaurant.park` value already; 147 restaurants carry
// `restaurant.resort`; the remaining 93 have neither — of those, 66 sit
// in a real Disney Springs sub-area (`area` matches DISNEY_SPRINGS_AREAS)
// and the rest (EPCOT/Animal Kingdom/Wide World of Sports "Resort Area"
// labels, or no area at all) fall into Other rather than being
// mis-bucketed as Disney Springs.

import type { Restaurant } from '../data/types';
import { distanceToRestaurant, type Coordinates } from '../location/proximity';
import { resultKey, resultLabel, type SearchResult } from './rank';

const PARK_ORDER = [
  'Magic Kingdom Park',
  'EPCOT',
  "Disney's Hollywood Studios",
  "Disney's Animal Kingdom Theme Park",
];

const DISNEY_SPRINGS_AREAS = new Set(['The Landing', 'West Side', 'Marketplace', 'Town Center']);

// Priority tiers per owner direction: parks -> resorts -> Disney Springs
// -> water parks -> other. Parks sub-order by PARK_ORDER; water parks
// alphabetically (tiebreak via label below) since there's no equivalent
// named order for them.
const RESORT_PRIORITY = 20;
const DISNEY_SPRINGS_PRIORITY = 30;
const WATER_PARK_PRIORITY = 40;
const OTHER_PRIORITY = 50;

function bucketFor(r: Restaurant): { priority: number; label: string } {
  if (r.park) {
    const parkIndex = PARK_ORDER.indexOf(r.park);
    if (parkIndex !== -1) return { priority: parkIndex, label: r.park };
    return { priority: WATER_PARK_PRIORITY, label: r.park };
  }
  if (r.resort) return { priority: RESORT_PRIORITY, label: 'Disney Resorts' };
  if (r.area && DISNEY_SPRINGS_AREAS.has(r.area)) return { priority: DISNEY_SPRINGS_PRIORITY, label: 'Disney Springs' };
  return { priority: OTHER_PRIORITY, label: 'Other' };
}

export type ResultRow =
  | { type: 'group-header'; key: string; label: string }
  | { type: 'area-header'; key: string; label: string }
  | { type: 'result'; key: string; result: SearchResult };

function restaurantOf(r: SearchResult): Restaurant | null {
  return r.kind === 'restaurant' || r.kind === 'item' ? r.restaurant : null;
}

// Restaurants-first, then items — each independently grouped by
// park/bucket, then sorted by match quality before area. A park with both
// restaurant and item matches
// gets two separate group-header rows (one under the restaurants run,
// one under the items run) rather than a single merged one, since
// "restaurants first" is the primary sort key, location the secondary
// one — not the other way around. `pass` is folded into every synthetic
// row's key here specifically so those two group-header rows for the
// same park don't collide on React key — a real bug caught on-device
// (LogBox's "two children with the same key" for e.g. "group:EPCOT"
// appearing once under restaurants and once under items).
function buildLocationRows(
  results: SearchResult[],
  pass: 'restaurant' | 'item',
  origin: Coordinates | null
): ResultRow[] {
  if (results.length === 0) return [];

  const withLocation = results.map((r) => {
    const restaurant = restaurantOf(r);
    const bucket = restaurant ? bucketFor(restaurant) : { priority: OTHER_PRIORITY, label: 'Other' };
    return {
      r,
      bucket,
      area: restaurant?.area ?? null,
      distance: restaurant ? distanceToRestaurant(origin, restaurant) : null,
    };
  });

  const bucketDistances = new Map<string, number>();
  const areaDistances = new Map<string, number>();
  if (origin) {
    for (const entry of withLocation) {
      if (entry.distance === null) continue;
      const bucketKey = entry.bucket.label;
      bucketDistances.set(
        bucketKey,
        Math.min(bucketDistances.get(bucketKey) ?? Number.POSITIVE_INFINITY, entry.distance)
      );
      const areaKey = `${entry.bucket.label}:${entry.r.tier}:${entry.area ?? ''}`;
      areaDistances.set(areaKey, Math.min(areaDistances.get(areaKey) ?? Number.POSITIVE_INFINITY, entry.distance));
    }
  }

  withLocation.sort((a, b) => {
    if (origin) {
      const bucketDistanceA = bucketDistances.get(a.bucket.label) ?? Number.POSITIVE_INFINITY;
      const bucketDistanceB = bucketDistances.get(b.bucket.label) ?? Number.POSITIVE_INFINITY;
      if (bucketDistanceA !== bucketDistanceB) return bucketDistanceA - bucketDistanceB;
    }
    if (a.bucket.priority !== b.bucket.priority) return a.bucket.priority - b.bucket.priority;
    if (a.bucket.label !== b.bucket.label) return a.bucket.label.localeCompare(b.bucket.label);
    // Relevance beats sub-area ordering inside a park. A user typing the
    // beginning of a name expects "Cosmic..." to appear before "Pecos..."
    // for `Cos`, even though Frontierland sorts before Tomorrowland.
    if (a.r.tier !== b.r.tier) return a.r.tier - b.r.tier;
    if (origin) {
      const areaKeyA = `${a.bucket.label}:${a.r.tier}:${a.area ?? ''}`;
      const areaKeyB = `${b.bucket.label}:${b.r.tier}:${b.area ?? ''}`;
      const areaDistanceA = areaDistances.get(areaKeyA) ?? Number.POSITIVE_INFINITY;
      const areaDistanceB = areaDistances.get(areaKeyB) ?? Number.POSITIVE_INFINITY;
      if (areaDistanceA !== areaDistanceB) return areaDistanceA - areaDistanceB;
    }
    // No-area entries sort after named areas within the same bucket —
    // general/park-wide matches trail the specific-land clusters.
    const areaA = a.area ?? '￿';
    const areaB = b.area ?? '￿';
    if (areaA !== areaB) return areaA.localeCompare(areaB);
    if (origin) {
      const distanceA = a.distance ?? Number.POSITIVE_INFINITY;
      const distanceB = b.distance ?? Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) return distanceA - distanceB;
    }
    return resultLabel(a.r).localeCompare(resultLabel(b.r));
  });

  const rows: ResultRow[] = [];
  let currentGroupLabel: string | null = null;
  let currentArea: string | null = null;
  for (const { r, bucket, area } of withLocation) {
    if (bucket.label !== currentGroupLabel) {
      rows.push({ type: 'group-header', key: `group:${pass}:${bucket.label}`, label: bucket.label });
      currentGroupLabel = bucket.label;
      currentArea = null; // force a fresh area header under the new group
    }
    if (area && area !== currentArea) {
      rows.push({ type: 'area-header', key: `area:${pass}:${bucket.label}:${r.tier}:${area}`, label: area });
    }
    currentArea = area;
    rows.push({ type: 'result', key: resultKey(r), result: r });
  }
  return rows;
}

export function groupResultsByLocation(results: SearchResult[], origin: Coordinates | null = null): ResultRow[] {
  const restaurantResults = results.filter((r) => r.kind === 'restaurant');
  const itemResults = results.filter((r) => r.kind === 'item');
  const relatedResults = results.filter((r) => r.kind === 'related');

  return [
    ...buildLocationRows(restaurantResults, 'restaurant', origin),
    ...buildLocationRows(itemResults, 'item', origin),
    ...relatedResults.map((r) => ({ type: 'result' as const, key: resultKey(r), result: r })),
  ];
}
