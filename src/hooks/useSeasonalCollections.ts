import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getGeneralSeasonalCollectionItems } from '../data/db';
import {
  dedupeSeasonalCollectionItems,
  SEASONAL_COLLECTIONS,
  type SeasonalCollectionConfig,
} from '../data/seasonalCollections';
import type { MenuItem } from '../data/types';
import { useDataProvider } from './useDataProvider';

export interface ActiveSeasonalCollection extends SeasonalCollectionConfig {
  items: MenuItem[];
}

export function useSeasonalCollections(): ActiveSeasonalCollection[] {
  const [activeCollections, setActiveCollections] = useState<ActiveSeasonalCollection[]>([]);
  const { restaurants, lastSyncedAt } = useDataProvider();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const restaurantPark = new Map(
        restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant.park])
      );

      Promise.all(
        SEASONAL_COLLECTIONS.map(async (collection) => {
          const candidates = await getGeneralSeasonalCollectionItems(
            collection.categoryGroups,
            collection.excludedTicketedCategoryGroups
          );
          const items = dedupeSeasonalCollectionItems(
            candidates.filter((item) => restaurantPark.get(item.restaurant_id) === collection.park)
          );
          return { ...collection, items };
        })
      )
        .then((collections) => {
          if (!cancelled) {
            setActiveCollections(collections.filter((collection) => collection.items.length > 0));
          }
        })
        .catch(() => {
          if (!cancelled) setActiveCollections([]);
        });

      return () => {
        cancelled = true;
      };
    }, [lastSyncedAt, restaurants])
  );

  return activeCollections;
}
