import type { MenuItem } from './types';
import { normalizeForSearch } from './diacritics.ts';

export interface SeasonalCollectionConfig {
  id: string;
  categoryGroups: string[];
  excludedTicketedCategoryGroups: string[];
  park: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: string;
}

export const SEASONAL_COLLECTIONS: SeasonalCollectionConfig[] = [
  {
    id: 'magic-kingdom-halloween-treats',
    categoryGroups: [
      'halloween-offerings',
      'halloween-exclusive',
      'halloween-exclusives',
    ],
    excludedTicketedCategoryGroups: [
      'mickeys-not-so-scary-halloween-party-exclusives',
      'halloween-exclusives',
    ],
    park: 'Magic Kingdom Park',
    eyebrow: 'HALLOWEEN TREATS',
    title: 'Halloween Treats Around Magic Kingdom',
    subtitle: 'Seasonal treats available beyond the party menu',
    icon: '🎃',
  },
];

const ALLERGY_VARIANT_SUFFIX = /\(\s*for [^)]+allerg(?:y|ies)\s*\)\s*$/i;

function preference(item: MenuItem): [number, number, number, string] {
  return [
    ALLERGY_VARIANT_SUFFIX.test(item.description ?? '') ? 1 : 0,
    item.dining_period === 'Special' ? 1 : 0,
    item.description?.length ?? Number.MAX_SAFE_INTEGER,
    item.item_id,
  ];
}

function isPreferred(candidate: MenuItem, current: MenuItem): boolean {
  const left = preference(candidate);
  const right = preference(current);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    return left[index] < right[index];
  }
  return false;
}

// Disney can repeat one item across meal periods and can publish a second ID
// whose only difference is an allergy-oriented description. Collection counts
// should describe guest-visible products, while retaining the same-named treat
// at a different restaurant as a distinct place to find it.
export function dedupeSeasonalCollectionItems(items: MenuItem[]): MenuItem[] {
  const byRestaurantAndName = new Map<string, MenuItem>();
  for (const item of items) {
    const key = `${item.restaurant_id}:${normalizeForSearch(item.item)}`;
    const current = byRestaurantAndName.get(key);
    if (!current || isPreferred(item, current)) {
      byRestaurantAndName.set(key, item);
    }
  }
  return [...byRestaurantAndName.values()].sort((left, right) =>
    left.restaurant_id.localeCompare(right.restaurant_id)
    || left.item.localeCompare(right.item)
  );
}
