// Fetches walking distances (miles) for the given restaurant ids from the
// current origin, via the nearby_restaurants RPC (see
// src/location/walkingDistance.ts). Returns a Map keyed by restaurant_id;
// any id not present should fall back to straight-line distance at the
// call site -- this hook never fabricates a number for a restaurant it
// couldn't route to (offline, RPC error, outside the loaded park graph).
import { useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../location/proximity';
import { fetchWalkingDistances } from '../location/walkingDistance';

export function useWalkingDistances(
  origin: Coordinates | null,
  restaurantIds: string[]
): Map<string, number> {
  const [distances, setDistances] = useState<Map<string, number>>(new Map());
  const requestIdRef = useRef(0);
  const idsKey = restaurantIds.join(',');

  useEffect(() => {
    if (!origin || restaurantIds.length === 0) {
      setDistances(new Map());
      return;
    }
    const requestId = ++requestIdRef.current;
    fetchWalkingDistances(origin, restaurantIds).then((result) => {
      if (requestId === requestIdRef.current) setDistances(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.latitude, origin?.longitude, idsKey]);

  return distances;
}
