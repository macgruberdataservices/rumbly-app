import type { MenuItem, SearchIndexEntry } from './types';

type MenuItemActionCandidate = Pick<
  MenuItem | SearchIndexEntry,
  'restaurant_id' | 'item_id' | 'item'
>;

// This Disney row is repeated across restaurants and meal periods but is
// guidance for guests, not something a person can eat, rate, or journal.
// Keep the ID rule because the text can change; keep the text rule so a
// future import with a new ID does not immediately expose activity actions.
const NON_ACTIONABLE_ITEM_IDS = new Set(['411885657']);
const NON_ACTIONABLE_ITEM_NAMES = new Set([
  'guests must speak to a cast member about their allergy-friendly request',
]);

function normalizeItemName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[.!]+$/, '');
}

export function isActionableMenuItem(item: MenuItemActionCandidate): boolean {
  if (!item.restaurant_id.trim() || !item.item_id.trim() || !item.item.trim()) {
    return false;
  }
  if (NON_ACTIONABLE_ITEM_IDS.has(item.item_id)) {
    return false;
  }
  return !NON_ACTIONABLE_ITEM_NAMES.has(normalizeItemName(item.item));
}
