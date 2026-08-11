import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isLegacyHandCodedMainRecord,
  shouldImportMainRestaurant,
  visibleRestaurantMenuItems,
} from '../src/data/restaurantVisibility.ts';

test('stale HANDCODE rows never enter through the main restaurant feed', () => {
  const stale = { facility_id: 'HANDCODE.010', show_in_app: true };
  assert.equal(isLegacyHandCodedMainRecord(stale), true);
  assert.equal(shouldImportMainRestaurant(stale), false);
});

test('main-feed visibility still accepts only explicitly visible Disney rows', () => {
  assert.equal(shouldImportMainRestaurant({ facility_id: '411901863', show_in_app: true }), true);
  assert.equal(shouldImportMainRestaurant({ facility_id: '411901863', show_in_app: false }), false);
});

test('menus for hidden or review-only restaurants do not become search orphans', () => {
  const items = [
    { restaurant_id: 'energy-bytes', item_id: 'manual' },
    { restaurant_id: 'energy-bytes-2', item_id: 'review' },
    { restaurant_id: 'cosmic-rays', item_id: 'visible' },
  ];
  assert.deepEqual(
    visibleRestaurantMenuItems(items, new Set(['cosmic-rays'])),
    [{ restaurant_id: 'cosmic-rays', item_id: 'visible' }]
  );
});
