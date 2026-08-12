import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getMenuItemsByCategoryGroups } from '../data/db';
import { TICKETED_EVENTS, type TicketedEventConfig } from '../data/ticketedEvents';
import type { MenuItem } from '../data/types';
import { useDataProvider } from './useDataProvider';

export interface ActiveTicketedEvent extends TicketedEventConfig {
  items: MenuItem[];
}

const ALL_CATEGORY_GROUPS = TICKETED_EVENTS.flatMap((event) => event.categoryGroups);

// Re-checked on every Explore focus (cheap -- a handful of SQLite rows),
// same "goes away the moment the data does" requirement the registry
// itself is built around: no cached/stale "is this event on" flag
// anywhere, just whatever's actually in the synced menu right now.
export function useTicketedEvents(): ActiveTicketedEvent[] {
  const [activeEvents, setActiveEvents] = useState<ActiveTicketedEvent[]>([]);
  const { lastSyncedAt } = useDataProvider();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getMenuItemsByCategoryGroups(ALL_CATEGORY_GROUPS)
        .then((items) => {
          if (cancelled) return;
          const next = TICKETED_EVENTS.map((event) => ({
            ...event,
            items: items.filter((item) => event.categoryGroups.includes(item.category_group)),
          })).filter((event) => event.items.length > 0);
          setActiveEvents(next);
        })
        .catch(() => {
          if (!cancelled) setActiveEvents([]);
        });
      return () => {
        cancelled = true;
      };
    }, [lastSyncedAt])
  );

  return activeEvents;
}
