// Mirrors dataProvider.tsx's shape: loads the local activity Sets once,
// exposes write functions that update both SQLite (via activity.ts) and
// in-memory state so consumers (ExpandedHeader, RestaurantCard,
// MenuItemRow) re-render.
//
// Milestone 12: when signed in, also runs a background sync pass (pull
// cross-device changes on sign-in/launch, push local writes as they
// happen) via sync.ts. Entirely inert while signed out -- Love/Got It
// stay local-only in that case, per the decision that
// account sign-in is never required to use them.
//
// Love exists at restaurant and item level; Need It is item-only. Got It
// is a repeatable event at both levels, with count Maps derived from those
// rows for compact UI state.

import React, { createContext, useCallback, useEffect, useState } from 'react';
import {
  toggleLove as toggleLoveDb,
  toggleItemLove as toggleItemLoveDb,
  toggleItemNeedIt as toggleItemNeedItDb,
  addRestaurantGotIt as addRestaurantGotItDb,
  addItemGotIt as addItemGotItDb,
  setGotItRating as setGotItRatingDb,
  undoGotIt as undoGotItDb,
  loadLovedIds,
  loadLovedItemKeys,
  loadNeedItItemKeys,
  loadGotItItemCounts,
  loadGotItRestaurantCounts,
  emptyPersonalActivityReadModel,
  loadPersonalActivityReadModel,
  type PersonalActivityReadModel,
} from './activity';
import { syncActivity } from './sync';
import { useAuth } from '../hooks/useAuth';

function itemKey(restaurantId: string, itemId: string): string {
  return `${restaurantId}:${itemId}`;
}

interface ActivityContextValue {
  lovedIds: Set<string>;
  lovedItemKeys: Set<string>;
  needItItemKeys: Set<string>;
  gotItItemCounts: Map<string, number>;
  gotItRestaurantCounts: Map<string, number>;
  personalActivity: PersonalActivityReadModel;
  isActivityReady: boolean;
  reloadActivity: () => Promise<void>;
  toggleLove: (restaurantId: string) => Promise<void>;
  toggleItemLove: (restaurantId: string, itemId: string) => Promise<void>;
  toggleItemNeedIt: (restaurantId: string, itemId: string) => Promise<void>;
  addRestaurantGotIt: (restaurantId: string) => Promise<string>;
  addItemGotIt: (restaurantId: string, itemId: string) => Promise<string>;
  confirmGotIt: (clientId: string, rating: number | null) => Promise<void>;
  undoGotIt: (clientId: string, restaurantId: string, itemId: string | null) => Promise<void>;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [lovedIds, setLovedIds] = useState<Set<string>>(new Set());
  const [lovedItemKeys, setLovedItemKeys] = useState<Set<string>>(new Set());
  const [needItItemKeys, setNeedItItemKeys] = useState<Set<string>>(new Set());
  const [gotItItemCounts, setGotItItemCounts] = useState<Map<string, number>>(new Map());
  const [gotItRestaurantCounts, setGotItRestaurantCounts] = useState<Map<string, number>>(new Map());
  const [personalActivity, setPersonalActivity] = useState<PersonalActivityReadModel>(
    emptyPersonalActivityReadModel()
  );
  const [isActivityReady, setIsActivityReady] = useState(false);

  const refreshPersonalActivity = useCallback(() => {
    loadPersonalActivityReadModel()
      .then(setPersonalActivity)
      .catch((error) => console.warn('personal activity refresh failed:', error));
  }, []);

  const reloadFromDb = useCallback(async () => {
    const [loved, lovedItems, needItItems, gotItItems, gotItRestaurants, readModel] = await Promise.all([
      loadLovedIds(),
      loadLovedItemKeys(),
      loadNeedItItemKeys(),
      loadGotItItemCounts(),
      loadGotItRestaurantCounts(),
      loadPersonalActivityReadModel(),
    ]);
    setLovedIds(loved);
    setLovedItemKeys(lovedItems);
    setNeedItItemKeys(needItItems);
    setGotItItemCounts(gotItItems);
    setGotItRestaurantCounts(gotItRestaurants);
    setPersonalActivity(readModel);
    setIsActivityReady(true);
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

  const toggleLove = useCallback(
    async (restaurantId: string) => {
      const nowLoved = await toggleLoveDb(restaurantId);
      setLovedIds((prev) => {
        const next = new Set(prev);
        if (nowLoved) {
          next.add(restaurantId);
        } else {
          next.delete(restaurantId);
        }
        return next;
      });
      if (user) {
        syncActivity(user.id).catch((err) => console.warn('sync after Love failed:', err));
      }
      refreshPersonalActivity();
    },
    [user]
  );

  const toggleItemLove = useCallback(
    async (restaurantId: string, itemId: string) => {
      const nowLoved = await toggleItemLoveDb(restaurantId, itemId);
      const key = itemKey(restaurantId, itemId);
      setLovedItemKeys((prev) => {
        const next = new Set(prev);
        if (nowLoved) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
      if (user) {
        syncActivity(user.id).catch((err) => console.warn('sync after item Love failed:', err));
      }
      refreshPersonalActivity();
    },
    [user]
  );

  const toggleItemNeedIt = useCallback(
    async (restaurantId: string, itemId: string) => {
      const nowNeeded = await toggleItemNeedItDb(restaurantId, itemId);
      const key = itemKey(restaurantId, itemId);
      setNeedItItemKeys((prev) => {
        const next = new Set(prev);
        if (nowNeeded) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      });
      if (user) {
        syncActivity(user.id).catch((err) => console.warn('sync after item Need It failed:', err));
      }
      refreshPersonalActivity();
    },
    [user]
  );

  const addRestaurantGotIt = useCallback(
    async (restaurantId: string) => {
      const clientId = await addRestaurantGotItDb(restaurantId);
      setGotItRestaurantCounts((prev) => {
        const next = new Map(prev);
        next.set(restaurantId, (next.get(restaurantId) ?? 0) + 1);
        return next;
      });
      refreshPersonalActivity();
      return clientId;
    },
    []
  );

  const addItemGotIt = useCallback(
    async (restaurantId: string, itemId: string) => {
      const clientId = await addItemGotItDb(restaurantId, itemId);
      setGotItItemCounts((prev) => {
        const next = new Map(prev);
        const key = itemKey(restaurantId, itemId);
        next.set(key, (next.get(key) ?? 0) + 1);
        return next;
      });
      refreshPersonalActivity();
      return clientId;
    },
    []
  );

  const confirmGotIt = useCallback(
    async (clientId: string, rating: number | null) => {
      if (rating !== null) {
        await setGotItRatingDb(clientId, rating);
      }
      if (user) {
        syncActivity(user.id).catch((err) => console.warn('sync after Got It confirmation failed:', err));
      }
      refreshPersonalActivity();
    },
    [user]
  );

  const undoGotIt = useCallback(
    async (clientId: string, restaurantId: string, itemId: string | null) => {
      await undoGotItDb(clientId);
      if (itemId) {
        const key = itemKey(restaurantId, itemId);
        setGotItItemCounts((prev) => {
          const next = new Map(prev);
          const count = Math.max(0, (next.get(key) ?? 0) - 1);
          if (count === 0) next.delete(key);
          else next.set(key, count);
          return next;
        });
      } else {
        setGotItRestaurantCounts((prev) => {
          const next = new Map(prev);
          const count = Math.max(0, (next.get(restaurantId) ?? 0) - 1);
          if (count === 0) next.delete(restaurantId);
          else next.set(restaurantId, count);
          return next;
        });
      }
      if (user) {
        syncActivity(user.id).catch((err) => console.warn('sync after Got It undo failed:', err));
      }
      refreshPersonalActivity();
    },
    [user]
  );

  return (
    <ActivityContext.Provider
      value={{
        lovedIds,
        lovedItemKeys,
        needItItemKeys,
        gotItItemCounts,
        gotItRestaurantCounts,
        personalActivity,
        isActivityReady,
        reloadActivity: reloadFromDb,
        toggleLove,
        toggleItemLove,
        toggleItemNeedIt,
        addRestaurantGotIt,
        addItemGotIt,
        confirmGotIt,
        undoGotIt,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}

export { ActivityContext };
