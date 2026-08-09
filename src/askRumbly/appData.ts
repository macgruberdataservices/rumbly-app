import { normalizeForSearch } from '../data/diacritics';
import type { HoursData, MenuItem, Restaurant, SearchIndexEntry } from '../data/types';
import type { AskRumblyData } from './dataTypes';

function toSearchIndexEntry(item: MenuItem): SearchIndexEntry {
  return {
    restaurant_id: item.restaurant_id,
    item_id: item.item_id,
    item: item.item,
    _norm: normalizeForSearch(item.item),
    category: item.category,
    price_display: item.price_display,
    price_changed: item.price_changed,
    previous_price: item.previous_price,
    show_in_menu: item.show_in_menu,
    is_festival_item: item.is_festival_item,
    dining_period: item.dining_period,
    norm_categories: item.norm_categories,
    is_kids: item.is_kids,
    is_allergy_friendly: item.is_allergy_friendly,
    has_allergy_option: item.has_allergy_option,
    allergens: item.allergens,
    allergy_free_of: item.allergy_free_of,
    first_seen: item.first_seen,
    description: item.description,
  };
}

/**
 * Adapts the app's already-imported SQLite/JSON data to the same semantic
 * runtime contract used by the off-app validator. No second network fetch or
 * Node cache is involved in the app path.
 */
export function buildAskRumblyData(
  restaurants: Restaurant[],
  menuItems: MenuItem[],
  hoursData: HoursData | null,
  searchIndex?: SearchIndexEntry[],
): AskRumblyData {
  return {
    restaurants,
    menuItems,
    hoursData,
    // Prefer the app's already-published slim index. Rebuilding a second
    // 45k-row projection from full SQLite records is needlessly expensive on
    // a phone; the fallback keeps this adapter useful in isolated tests.
    searchIndex: searchIndex ?? menuItems.map(toSearchIndexEntry),
  };
}
