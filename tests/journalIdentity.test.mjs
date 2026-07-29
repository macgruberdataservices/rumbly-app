import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupeByItemIdentity,
  getItemIdentityKey,
  getItemIdentityKeyFor,
  getItemPresentationKey,
  hasSameItemIdentity,
} from '../src/data/itemIdentity.ts';
import { isActionableMenuItem } from '../src/data/isActionableMenuItem.ts';

function menuRow(overrides = {}) {
  return {
    restaurant_id: 'restaurant-a',
    item_id: 'item-1',
    item: 'Grilled Chicken',
    dining_period: 'Lunch',
    category: 'Entrées',
    ...overrides,
  };
}

test('Need It set from lunch is visible from dinner for the same restaurant item', () => {
  const lunch = menuRow();
  const dinner = menuRow({ dining_period: 'Dinner' });
  const needItKeys = new Set([getItemIdentityKeyFor(lunch)]);

  assert.equal(needItKeys.has(getItemIdentityKeyFor(dinner)), true);
});

test('Love It is shared between regular and allergy-category rows', () => {
  const regular = menuRow({ category: 'Entrées' });
  const allergy = menuRow({ category: 'Allergy-Friendly Entrées' });
  const lovedKeys = new Set([getItemIdentityKeyFor(regular)]);

  assert.equal(lovedKeys.has(getItemIdentityKeyFor(allergy)), true);
});

test('Got It counts are shared across repeated rows', () => {
  const lunch = menuRow();
  const dinner = menuRow({ dining_period: 'Dinner' });
  const gotItCounts = new Map([[getItemIdentityKeyFor(lunch), 2]]);

  assert.equal(gotItCounts.get(getItemIdentityKeyFor(dinner)), 2);
});

test('personal rating averages are shared across repeated rows', () => {
  const regular = menuRow();
  const allergy = menuRow({ category: 'Allergy-Friendly Entrées' });
  const ratingAverages = new Map([
    [getItemIdentityKeyFor(regular), { average: 4.5, count: 2 }],
  ]);

  assert.deepEqual(
    ratingAverages.get(getItemIdentityKeyFor(allergy)),
    { average: 4.5, count: 2 }
  );
});

test('a Journal entry created from lunch is visible from dinner', () => {
  const lunch = menuRow();
  const dinner = menuRow({ dining_period: 'Dinner' });
  const journalEntries = new Map([[getItemIdentityKeyFor(lunch), ['entry-1']]]);

  assert.deepEqual(journalEntries.get(getItemIdentityKeyFor(dinner)), ['entry-1']);
});

test('stored meal-period context does not partition Journal history', () => {
  const lunchEntryTarget = {
    ...menuRow(),
    meal_period_snapshot: 'Lunch',
  };
  const dinnerEntryTarget = {
    ...menuRow({ dining_period: 'Dinner' }),
    meal_period_snapshot: 'Dinner',
  };

  assert.equal(
    getItemIdentityKeyFor(lunchEntryTarget),
    getItemIdentityKeyFor(dinnerEntryTarget)
  );
  assert.equal(hasSameItemIdentity(lunchEntryTarget, dinnerEntryTarget), true);
});

test('the same item_id at another restaurant remains a separate identity', () => {
  const firstRestaurant = menuRow();
  const secondRestaurant = menuRow({ restaurant_id: 'restaurant-b' });

  assert.notEqual(getItemIdentityKeyFor(firstRestaurant), getItemIdentityKeyFor(secondRestaurant));
  assert.equal(hasSameItemIdentity(firstRestaurant, secondRestaurant), false);
});

test('Journal target candidates deduplicate repeated menu rows by restaurant and item', () => {
  const rows = [
    menuRow(),
    menuRow({ dining_period: 'Dinner' }),
    menuRow({ category: 'Allergy-Friendly Entrées' }),
    menuRow({ item_id: 'item-2', item: 'Rice' }),
    menuRow({ restaurant_id: 'restaurant-b' }),
  ];

  assert.deepEqual(
    dedupeByItemIdentity(rows).map(getItemIdentityKeyFor),
    [
      getItemIdentityKey('restaurant-a', 'item-1'),
      getItemIdentityKey('restaurant-a', 'item-2'),
      getItemIdentityKey('restaurant-b', 'item-1'),
    ]
  );
});

test('presentation anchors remain distinct while activity identity is shared', () => {
  const activityKey = getItemIdentityKey('restaurant-a', 'item-1');
  const lunchAnchor = getItemPresentationKey('restaurant-a', 'item-1', 'Lunch:Entrées:0');
  const dinnerAnchor = getItemPresentationKey('restaurant-a', 'item-1', 'Dinner:Entrées:0');

  assert.equal(activityKey, getItemIdentityKey('restaurant-a', 'item-1'));
  assert.notEqual(lunchAnchor, dinnerAnchor);
});

test('instructional allergy-request rows are not actionable', () => {
  assert.equal(
    isActionableMenuItem(menuRow({
      item_id: '411885657',
      item: 'Guests must speak to a Cast Member about their allergy-friendly request',
    })),
    false
  );
  assert.equal(
    isActionableMenuItem(menuRow({
      item_id: 'future-id',
      item: 'Guests must speak to a Cast Member about their allergy-friendly request.',
    })),
    false
  );
  assert.equal(isActionableMenuItem(menuRow()), true);
});

test('rows with missing identity or item names are not actionable', () => {
  assert.equal(isActionableMenuItem(menuRow({ restaurant_id: '' })), false);
  assert.equal(isActionableMenuItem(menuRow({ item_id: '' })), false);
  assert.equal(isActionableMenuItem(menuRow({ item: '  ' })), false);
});
