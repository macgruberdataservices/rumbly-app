import type { MenuItem, Restaurant } from './types';

export function isLegacyHandCodedMainRecord(
  restaurant: Pick<Restaurant, 'facility_id'>
): boolean {
  return restaurant.facility_id.startsWith('HANDCODE.');
}

export function shouldImportMainRestaurant(
  restaurant: Pick<Restaurant, 'facility_id' | 'show_in_app'>
): boolean {
  // Hand-coded venues have their own authoritative manifest stream. Old
  // copies can survive in restaurant_data.json with stale show_in_app=true;
  // never let that obsolete stream override the current hand-coded record.
  return restaurant.show_in_app && !isLegacyHandCodedMainRecord(restaurant);
}

export function visibleRestaurantMenuItems<T extends Pick<MenuItem, 'restaurant_id'>>(
  items: T[],
  visibleRestaurantIds: ReadonlySet<string>
): T[] {
  return items.filter((item) => visibleRestaurantIds.has(item.restaurant_id));
}
