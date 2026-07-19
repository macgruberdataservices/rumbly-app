// Mirrors dataProvider.tsx's shape: loads the local activity Sets once,
// exposes write functions that update both SQLite (via activity.ts) and
// in-memory state so consumers (ExpandedHeader, RestaurantCard) re-render.

import React, { createContext, useCallback, useEffect, useState } from 'react';
import {
  toggleFavorite as toggleFavoriteDb,
  addCheckIn as addCheckInDb,
  loadFavoritedIds,
  loadCheckedInIds,
} from './activity';

interface ActivityContextValue {
  favoritedIds: Set<string>;
  checkedInIds: Set<string>;
  toggleFavorite: (restaurantId: string) => Promise<void>;
  addCheckIn: (restaurantId: string) => Promise<void>;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([loadFavoritedIds(), loadCheckedInIds()]).then(([favorited, checkedIn]) => {
      setFavoritedIds(favorited);
      setCheckedInIds(checkedIn);
    });
  }, []);

  const toggleFavorite = useCallback(async (restaurantId: string) => {
    const nowFavorited = await toggleFavoriteDb(restaurantId);
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (nowFavorited) {
        next.add(restaurantId);
      } else {
        next.delete(restaurantId);
      }
      return next;
    });
  }, []);

  const addCheckIn = useCallback(async (restaurantId: string) => {
    await addCheckInDb(restaurantId);
    setCheckedInIds((prev) => new Set(prev).add(restaurantId));
  }, []);

  return (
    <ActivityContext.Provider value={{ favoritedIds, checkedInIds, toggleFavorite, addCheckIn }}>
      {children}
    </ActivityContext.Provider>
  );
}

export { ActivityContext };
