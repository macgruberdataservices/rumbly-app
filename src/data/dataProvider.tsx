// Wires manifest.ts (decide if a fetch is needed) to importPipeline.ts
// (do the fetch + store) to fileStore.ts (load from cache). Mirrors the
// source app's checkAndLoadData() call site: cache-hit path never touches
// the network. Deliberately does NOT expose full menu items — those stay
// behind db.ts's on-demand query, used starting in Milestone 2.

import React, { createContext, useCallback, useEffect, useState } from 'react';
import type { Restaurant, HoursData } from './types';
import { LOCAL_FILES } from './constants';
import { readJSON } from './fileStore';
import { checkForUpdate, forceCheckForUpdate, markImported, getLastCheckedAt } from './manifest';
import { runImport, type ImportStats } from './importPipeline';

interface DataContextValue {
  restaurants: Restaurant[];
  hoursData: HoursData | null;
  isLoading: boolean;
  error: string | null;
  lastSyncedAt: number | null;
  lastImportStats: ImportStats | null;
  forceRefresh: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

async function loadFromCache(): Promise<{ restaurants: Restaurant[]; hoursData: HoursData | null }> {
  const [restaurants, hoursData] = await Promise.all([
    readJSON<Restaurant[]>(LOCAL_FILES.restaurantData),
    readJSON<HoursData>(LOCAL_FILES.hoursData),
  ]);
  return { restaurants: restaurants ?? [], hoursData };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [hoursData, setHoursData] = useState<HoursData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastImportStats, setLastImportStats] = useState<ImportStats | null>(null);

  const runInitialCheck = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await checkForUpdate();
      if (result.action === 'cache-hit' || result.action === 'unchanged') {
        const cached = await loadFromCache();
        setRestaurants(cached.restaurants);
        setHoursData(cached.hoursData);
      } else {
        const stats = await runImport(result.manifest);
        await markImported(result.manifest);
        setLastImportStats(stats);
        const cached = await loadFromCache();
        setRestaurants(cached.restaurants);
        setHoursData(cached.hoursData);
      }
      setLastSyncedAt(await getLastCheckedAt());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const forceRefresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await forceCheckForUpdate();
      if (result.action === 'import') {
        const stats = await runImport(result.manifest);
        await markImported(result.manifest);
        setLastImportStats(stats);
        const cached = await loadFromCache();
        setRestaurants(cached.restaurants);
        setHoursData(cached.hoursData);
      }
      // 'unchanged' already bumped lastCheckedAt inside forceCheckForUpdate.
      setLastSyncedAt(await getLastCheckedAt());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    runInitialCheck();
  }, [runInitialCheck]);

  return (
    <DataContext.Provider
      value={{ restaurants, hoursData, isLoading, error, lastSyncedAt, lastImportStats, forceRefresh }}
    >
      {children}
    </DataContext.Provider>
  );
}

export { DataContext };
