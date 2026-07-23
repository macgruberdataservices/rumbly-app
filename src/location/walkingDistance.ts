// Milestone: walking-distance proximity (mapping side-quest -- see
// Docs/MAPPING_DATA_NOTES.md). Calls the nearby_restaurants RPC (pgRouting
// over a corrected WDW walking graph, currently Magic Kingdom only) added
// in supabase/migrations/20260723000000_walkable_routing.sql.
//
// Product Rule from that doc: don't label these as walking distance until
// route confidence is high, and always keep straight-line as the fallback.
// This module only ever returns entries it got a real route for -- any
// restaurant not in the returned map (offline, RPC error, no route found,
// outside the loaded park) should fall back to distanceToRestaurant at the
// call site, not to a bad or fabricated number.

import { supabase } from '../data/supabaseClient';
import type { Coordinates } from './proximity';

const METERS_PER_MILE = 1609.344;

export async function fetchWalkingDistances(
  origin: Coordinates,
  restaurantIds: string[]
): Promise<Map<string, number>> {
  const distances = new Map<string, number>();
  if (restaurantIds.length === 0) return distances;

  const { data, error } = await supabase.rpc('nearby_restaurants', {
    p_lon: origin.longitude,
    p_lat: origin.latitude,
    p_restaurant_ids: restaurantIds,
  });

  if (error) {
    console.warn('fetchWalkingDistances failed, falling back to straight-line:', error.message);
    return distances;
  }

  for (const row of (data ?? []) as { restaurant_id: string; distance_m: number | null }[]) {
    if (row.distance_m !== null) {
      distances.set(row.restaurant_id, row.distance_m / METERS_PER_MILE);
    }
  }
  return distances;
}
