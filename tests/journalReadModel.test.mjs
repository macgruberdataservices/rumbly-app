import test from 'node:test';
import assert from 'node:assert/strict';
import {
  entriesForJournalPage,
  groupJournalEntriesByPlace,
  sortJournalEntries,
} from '../src/data/journalReadModel.ts';

function entry(overrides) {
  return {
    id: overrides.id,
    userId: 'user-1',
    clientId: `client-${overrides.id}`,
    restaurantId: overrides.restaurantId,
    itemId: overrides.itemId ?? null,
    restaurantNameSnapshot: overrides.restaurantName ?? 'The Restaurant',
    itemNameSnapshot: overrides.itemName ?? null,
    mealPeriodSnapshot: overrides.mealPeriod ?? null,
    visitedOn: overrides.visitedOn ?? '2026-07-01',
    note: overrides.note ?? null,
    syncState: 'synced',
    createdAt: overrides.createdAt ?? `${overrides.visitedOn ?? '2026-07-01'}T12:00:00.000Z`,
    updatedAt: overrides.createdAt ?? `${overrides.visitedOn ?? '2026-07-01'}T12:00:00.000Z`,
    deletedAt: null,
  };
}

const entries = [
  entry({
    id: 'lunch',
    restaurantId: 'restaurant-a',
    itemId: 'shared-item',
    itemName: 'Shared Sandwich',
    mealPeriod: 'Lunch',
    visitedOn: '2026-07-01',
  }),
  entry({
    id: 'dinner',
    restaurantId: 'restaurant-a',
    itemId: 'shared-item',
    itemName: 'Shared Sandwich',
    mealPeriod: 'Dinner',
    visitedOn: '2026-07-03',
  }),
  entry({
    id: 'other-restaurant',
    restaurantId: 'restaurant-b',
    restaurantName: 'Other Restaurant',
    itemId: 'shared-item',
    itemName: 'Different Restaurant Sandwich',
    mealPeriod: 'Lunch',
    visitedOn: '2026-07-02',
  }),
  entry({
    id: 'restaurant-only',
    restaurantId: 'restaurant-a',
    itemId: null,
    visitedOn: '2026-06-30',
  }),
];

test('sorts the timeline by visit date, newest first', () => {
  assert.deepEqual(
    sortJournalEntries(entries).map((item) => item.id),
    ['dinner', 'other-restaurant', 'lunch', 'restaurant-only']
  );
});

test('groups repeated meal-period rows by restaurant and item identity', () => {
  const places = groupJournalEntriesByPlace(entries);
  const restaurantA = places.find((place) => place.restaurantId === 'restaurant-a');

  assert.ok(restaurantA);
  assert.equal(restaurantA.itemGroups.length, 1);
  assert.deepEqual(
    restaurantA.itemGroups[0].entries.map((item) => item.id),
    ['dinner', 'lunch']
  );
  assert.equal(restaurantA.restaurantEntries.length, 1);
});

test('keeps a reused item id separate across restaurants', () => {
  const places = groupJournalEntriesByPlace(entries);

  assert.equal(places.length, 2);
  assert.equal(places[0].itemGroups.length, 1);
  assert.equal(places[1].itemGroups.length, 1);
  assert.notEqual(places[0].itemGroups[0].key, places[1].itemGroups[0].key);
});

test('item detail includes every meal period at one restaurant only', () => {
  assert.deepEqual(
    entriesForJournalPage(entries, 'restaurant-a', 'shared-item').map((item) => item.id),
    ['dinner', 'lunch']
  );
});

test('restaurant detail includes item and restaurant-level entries', () => {
  assert.deepEqual(
    entriesForJournalPage(entries, 'restaurant-a').map((item) => item.id),
    ['dinner', 'lunch', 'restaurant-only']
  );
});
