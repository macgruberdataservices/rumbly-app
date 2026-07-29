import type { JournalEntry } from './journal.ts';
import { getItemIdentityKey } from './itemIdentity.ts';

export interface JournalItemGroup {
  key: string;
  restaurantId: string;
  itemId: string;
  itemName: string;
  entries: JournalEntry[];
  latestVisitedOn: string;
}

export interface JournalPlaceGroup {
  restaurantId: string;
  restaurantName: string;
  entries: JournalEntry[];
  restaurantEntries: JournalEntry[];
  itemGroups: JournalItemGroup[];
  latestVisitedOn: string;
}

export function sortJournalEntries(entries: readonly JournalEntry[]): JournalEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.visitedOn.localeCompare(left.visitedOn) ||
      right.createdAt.localeCompare(left.createdAt)
  );
}

export function groupJournalEntriesByPlace(
  entries: readonly JournalEntry[]
): JournalPlaceGroup[] {
  const places = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const placeEntries = places.get(entry.restaurantId) ?? [];
    placeEntries.push(entry);
    places.set(entry.restaurantId, placeEntries);
  }

  return [...places.entries()]
    .map(([restaurantId, unsortedEntries]) => {
      const placeEntries = sortJournalEntries(unsortedEntries);
      const itemEntries = new Map<string, JournalEntry[]>();

      for (const entry of placeEntries) {
        if (!entry.itemId) continue;
        const key = getItemIdentityKey(entry.restaurantId, entry.itemId);
        const matchingEntries = itemEntries.get(key) ?? [];
        matchingEntries.push(entry);
        itemEntries.set(key, matchingEntries);
      }

      const itemGroups = [...itemEntries.entries()]
        .map(([key, matchingEntries]): JournalItemGroup => {
          const sortedEntries = sortJournalEntries(matchingEntries);
          const latest = sortedEntries[0];
          return {
            key,
            restaurantId,
            itemId: latest.itemId!,
            itemName: latest.itemNameSnapshot ?? 'Menu item',
            entries: sortedEntries,
            latestVisitedOn: latest.visitedOn,
          };
        })
        .sort(
          (left, right) =>
            right.latestVisitedOn.localeCompare(left.latestVisitedOn) ||
            left.itemName.localeCompare(right.itemName)
        );

      return {
        restaurantId,
        restaurantName: placeEntries[0].restaurantNameSnapshot,
        entries: placeEntries,
        restaurantEntries: placeEntries.filter((entry) => !entry.itemId),
        itemGroups,
        latestVisitedOn: placeEntries[0].visitedOn,
      };
    })
    .sort(
      (left, right) =>
        right.latestVisitedOn.localeCompare(left.latestVisitedOn) ||
        left.restaurantName.localeCompare(right.restaurantName)
    );
}

export function entriesForJournalPage(
  entries: readonly JournalEntry[],
  restaurantId: string,
  itemId?: string
): JournalEntry[] {
  return sortJournalEntries(
    entries.filter(
      (entry) =>
        entry.restaurantId === restaurantId &&
        (itemId === undefined || entry.itemId === itemId)
    )
  );
}
