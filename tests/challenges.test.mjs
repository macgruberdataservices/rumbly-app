import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateChallenge } from '../src/challenges/evaluate.ts';

const quickFive = {
  id: 'quick-five',
  version: 1,
  title: 'Quick Five',
  description: 'Visit five different Quick Service restaurants.',
  badgeTitle: 'Quick Five',
  repeatMode: 'repeatable_round',
  goal: { kind: 'distinct_restaurants', requiredCount: 5 },
  criteria: { serviceStyles: ['Quick Service'] },
};

function restaurant(id, overrides = {}) {
  return {
    restaurant_id: id,
    restaurant: id,
    service_style: 'Quick Service',
    park: 'Magic Kingdom Park',
    show_in_app: true,
    ...overrides,
  };
}

function gotIt(clientId, restaurantId, occurredAt, itemId = null) {
  return {
    clientId,
    restaurantId,
    itemId,
    targetType: itemId ? 'item' : 'restaurant',
    activityType: 'got_it',
    rating: null,
    occurredAt,
    updatedAt: occurredAt,
  };
}

const restaurants = Array.from({ length: 8 }, (_, index) => restaurant(`r${index + 1}`));

test('repeatable rounds reset after five distinct restaurants', () => {
  const events = Array.from({ length: 6 }, (_, index) =>
    gotIt(`e${index + 1}`, `r${index + 1}`, `2026-07-${String(index + 1).padStart(2, '0')}`)
  );
  const progress = evaluateChallenge(quickFive, events, restaurants);
  assert.equal(progress.completions.length, 1);
  assert.deepEqual(progress.completions[0].restaurantIds, ['r1', 'r2', 'r3', 'r4', 'r5']);
  assert.deepEqual(progress.currentRestaurantIds, ['r6']);
});

test('duplicate venue events count once per round and item events count', () => {
  const events = [
    gotIt('e1', 'r1', '2026-07-01'),
    gotIt('e2', 'r1', '2026-07-02', 'item-1'),
    gotIt('e3', 'r2', '2026-07-03', 'item-2'),
  ];
  assert.equal(evaluateChallenge(quickFive, events, restaurants).currentCount, 2);
});

test('restaurants outside the challenge criteria are ignored', () => {
  const catalog = [...restaurants, restaurant('table', { service_style: 'Table Service' })];
  const events = [gotIt('e1', 'table', '2026-07-01'), gotIt('e2', 'r1', '2026-07-02')];
  assert.deepEqual(evaluateChallenge(quickFive, events, catalog).currentRestaurantIds, ['r1']);
});

test('one-time challenges retain their completed venue set', () => {
  const once = { ...quickFive, id: 'park-all', repeatMode: 'once', goal: { ...quickFive.goal, requiredCount: 2 } };
  const events = [gotIt('e1', 'r1', '2026-07-01'), gotIt('e2', 'r2', '2026-07-02'), gotIt('e3', 'r3', '2026-07-03')];
  const progress = evaluateChallenge(once, events, restaurants);
  assert.equal(progress.isComplete, true);
  assert.equal(progress.completions.length, 1);
  assert.deepEqual(progress.currentRestaurantIds, ['r1', 'r2']);
});

test('the same Got It events can satisfy parallel challenges independently', () => {
  const parkChallenge = {
    ...quickFive,
    id: 'magic-kingdom-quick-service',
    repeatMode: 'once',
    goal: { ...quickFive.goal, requiredCount: 'all' },
    criteria: { serviceStyles: ['Quick Service'], parks: ['Magic Kingdom Park'] },
  };
  const catalog = [restaurant('r1'), restaurant('r2')];
  const events = [gotIt('e1', 'r1', '2026-07-01'), gotIt('e2', 'r2', '2026-07-02')];
  assert.equal(evaluateChallenge(quickFive, events, catalog).currentCount, 2);
  assert.equal(evaluateChallenge(parkChallenge, events, catalog).isComplete, true);
});
