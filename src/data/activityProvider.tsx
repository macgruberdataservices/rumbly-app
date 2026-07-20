// Mirrors dataProvider.tsx's shape: loads the local activity Sets once,
// exposes write functions that update both SQLite (via activity.ts) and
// in-memory state so consumers (ExpandedHeader, RestaurantCard,
// MenuItemRow) re-render.
//
// Milestone 12: when signed in, also runs a background sync pass (pull
// cross-device changes on sign-in/launch, push local writes as they
// happen) via sync.ts. Entirely inert while signed out -- Favorites/
// check-ins stay local-only in that case, per the Phase 3 decision that
// account sign-in is never required to use them.
//
// Favorite/Want-to-Try split by level (owner decision 2026-07-20, after
// a first pass wrongly put both at restaurant-level only): Favorite stays
// restaurant-level via ExpandedHeader (favoritedIds) *and* gets an
// independent item-level version (favoritedItemKeys, keyed by
// `${restaurantId}:${itemId}`); Want-to-Try is item-level only
// (wantToTriedItemKeys) -- no restaurant-level consumer for it exists.

import React, { createContext, useCallback, useEffect, useState } from 'react';
import {
  toggleFavorite as toggleFavoriteDb,
  toggleItemFavorite as toggleItemFavoriteDb,
  toggleItemWantToTry as toggleItemWantToTryDb,
  addCheckIn as addCheckInDb,
  loadFavoritedIds,
  loadFavoritedItemKeys,
  loadWantToTriedItemKeys,
  loadCheckedInIds,
} from './activity';
import { syncActivity } from './sync';
import { useAuth } from '../hooks/useAuth';

function itemKey(restaurantId: string, itemId: string): string {
  return `${restaurantId}:${itemId}`;
}

interface ActivityContextValue {
  favoritedIds: Set<string>;
  favoritedItemKeys: Set<string>;
  wantToTriedItemKeys: Set<string>;
  checkedInIds: Set<string>;
  toggleFavorite: (restaurantId: string) => Promise<void>;
  toggleItemFavorite: (restaurantId: string, itemId: string) => Promise<void>;
  toggleItemWantToTry: (restaurantId: string, itemId: string) => Promise<void>;
  addCheckIn: (restaurantId: string) => Promise<void>;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [favoritedItemKeys, setFavoritedItemKeys] = useState<Set<string>>(new Set());
  const [wantToTriedItemKeys, setWantToTriedItemKeys] = useState<Set<string>>(new Set());
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());

  const reloadFromDb = useCallback(async () => {
    const [favorited, favoritedItems, wantToTriedItems, checkedIn] = await Promise.all([
      loadFavoritedIds(),
      loadFavoritedItemKeys(),
      loadWantToTriedItemKeys(),
      loadCheckedInIds(),
    ]);
    setFavoritedIds(favorited);
    setFavoritedItemKeys(favoritedItems);
    setWantToTriedItemKeys(wantToTriedItems);
    setCheckedInIds(checkedIn);
  }, []);

  useEffect(() => {
    reloadFromDb();
  }, [reloadFromDb]);

  // Fires once per sign-in (or on launch if a session was already
  // persisted) -- pulls any rows written from other devices, then reloads
  // the in-memory Sets so the pulled data shows up immediately.
  useEffect(() => {
    if (!user) {
      return;
    }
    syncActivity(user.id)
      .then(reloadFromDb)
      .catch((err) => console.warn('sync on sign-in failed:', err));
  }, [user, reloadFromDb]);

  const toggleFavorite = useCallback(
    async (restaurantId: string) => {
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
      if (user) {
        syncActivity(user.id).catch((err) => console.warn('sync after favorite failed:', err));
      }
    },
    [user]
  );

  const toggleItemFavorite = useCallback(
    async (restaurantId: string, itemId: string) => {
      const nowFavorited = await toggleItemFavoriteDb(restaurantId, itemId);
      const key = itemKey(restaurantId, itemId);
      setFavoritedItemKeys((prev) => {
        const next = new Set(prev);
        if (nowFavorited) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
      if (user) {
        syncActivity(user.id).catch((err) => console.warn('sync after item favorite failed:', err));
      }
    },
    [user]
  );

  const toggleItemWantToTry = useCallback(
    async (restaurantId: string, itemId: string) => {
      const nowWantToTried = await toggleItemWantToTryDb(restaurantId, itemId);
      const key = itemKey(restaurantId, itemId);
      setWantToTriedItemKeys((prev) => {
        const next = new Set(prev);
        if (nowWantToTried) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
      if (user) {
        syncActivity(user.id).catch((err) => console.warn('sync after item want-to-try failed:', err));
      }
    },
    [user]
  );

  const addCheckIn = useCallback(
    async (restaurantId: string) => {
      await addCheckInDb(restaurantId);
      setCheckedInIds((prev) => new Set(prev).add(restaurantId));
      if (user) {
        syncActivity(user.id).catch((err) => console.warn('sync after check-in failed:', err));
      }
    },
    [user]
  );

  return (
    <ActivityContext.Provider
      value={{
        favoritedIds,
        favoritedItemKeys,
        wantToTriedItemKeys,
        checkedInIds,
        toggleFavorite,
        toggleItemFavorite,
        toggleItemWantToTry,
        addCheckIn,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}

export { ActivityContext };
