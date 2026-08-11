// Guards the contract the chunked feed build introduced.
//
// buildFindFeed ran as a single synchronous call inside a useMemo and measured
// ~1,980ms on device -- long enough to swallow a tap or a keystroke, which is
// why launch and the return to Find felt like a hang. It is now a generator
// that pauses between rails (and mid-rail for for_you, the expensive one), and
// FindFeed pumps it across frames, painting rails as they land.
//
// Two things must hold and are not covered by the behavioural tests in
// recommendations.test.mjs:
//   1. Draining the generator must produce exactly what the synchronous API
//      produces. Chunking is a scheduling change, never a result change.
//   2. Partial results must be safe to render -- rails only ever accumulate,
//      never disappear or reorder -- because the UI paints every one of them.

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFindFeed, buildFindFeedSteps } from '../src/recommendations/engine.ts';

function restaurant(id, overrides = {}) {
  return {
    restaurant_id: id,
    restaurant: id,
    show_in_app: true,
    lat: 28.4,
    lng: -81.5,
    primary_cuisine: 'American',
    secondary_cuisine: null,
    service_style: 'Quick Service',
    price_tier: 2,
    ...overrides,
  };
}

function item(restaurantId, itemId, category, overrides = {}) {
  return {
    restaurant_id: restaurantId,
    item_id: itemId,
    item: itemId,
    category,
    norm_categories: [category.toLowerCase()],
    dining_period: 'Lunch',
    price_display: '$10.00',
    show_in_menu: true,
    is_festival_item: false,
    is_allergy_friendly: false,
    first_seen: '2026-07-01',
    ...overrides,
  };
}

function activity(overrides = {}) {
  return {
    lovedRestaurants: [],
    lovedItems: [],
    neededRestaurants: [],
    neededItems: [],
    gotItHistory: [],
    totalGotItCount: 0,
    ratedGotItCount: 0,
    restaurantRatingAverages: new Map(),
    itemRatingAverages: new Map(),
    ...overrides,
  };
}

// Deliberately larger than FOR_YOU_SCORING_BATCH (2,000) so the for_you rail
// is forced to yield mid-rail. A fixture under that size would exercise only
// the rail-boundary yields and quietly miss the in-loop path entirely.
const RESTAURANT_COUNT = 60;
const ITEMS_PER_RESTAURANT = 50;

function largeInput(overrides = {}) {
  const restaurants = Array.from({ length: RESTAURANT_COUNT }, (_, r) =>
    restaurant(`r${r}`, { primary_cuisine: r % 2 ? 'American' : 'Italian' })
  );
  const searchIndex = [];
  for (let r = 0; r < RESTAURANT_COUNT; r++) {
    for (let i = 0; i < ITEMS_PER_RESTAURANT; i++) {
      searchIndex.push(item(`r${r}`, `r${r}-i${i}`, i % 3 === 0 ? 'Entrees' : 'Desserts'));
    }
  }
  return {
    restaurants,
    searchIndex,
    activity: activity({
      lovedItems: [
        {
          clientId: 'c1',
          targetType: 'item',
          restaurantId: 'r0',
          itemId: 'r0-i0',
          activityType: 'love_it',
          rating: null,
          occurredAt: '2026-08-01T12:00:00.000Z',
          updatedAt: '2026-08-01T12:00:00.000Z',
        },
      ],
    }),
    events: [],
    changes: [],
    content: [],
    configs: [],
    origin: null,
    isEntitled: () => true,
    now: new Date('2026-08-11T12:00:00.000Z'),
    ...overrides,
  };
}

function drain(input) {
  const steps = buildFindFeedSteps(input);
  const partials = [];
  let step = steps.next();
  while (!step.done) {
    partials.push(step.value);
    step = steps.next();
  }
  return { partials, final: step.value };
}

test('the fixture is large enough to force a mid-rail yield', () => {
  const { partials } = drain(largeInput());
  const scoringSteps = partials.filter((step) => step.label === 'for_you.scoring');
  assert.ok(
    scoringSteps.length > 0,
    'fixture must exceed FOR_YOU_SCORING_BATCH or the in-loop yield path is untested'
  );
});

test('draining the generator matches the synchronous API exactly', () => {
  const input = largeInput();
  const { final } = drain(input);
  assert.deepEqual(final, buildFindFeed(largeInput()));
});

test('chunking never changes the result, with or without location', () => {
  for (const origin of [null, { latitude: 28.4177, longitude: -81.5812 }]) {
    const { final } = drain(largeInput({ origin }));
    assert.deepEqual(final, buildFindFeed(largeInput({ origin })));
  }
});

test('every step is labelled, so cost can be attributed to a rail', () => {
  const { partials } = drain(largeInput());
  for (const step of partials) {
    assert.equal(typeof step.label, 'string');
    assert.ok(step.label.length > 0);
  }
  assert.equal(partials[0].label, 'setup', 'setup must be the first pause point');
});

test('partial results only ever accumulate rails, never lose or reorder them', () => {
  const { partials, final } = drain(largeInput({
    origin: { latitude: 28.4177, longitude: -81.5812 },
  }));

  let previous = [];
  for (const step of partials) {
    const keys = step.modules.map((module) => module.key);
    // Monotonic: the UI paints each of these, so a rail vanishing mid-build
    // would show as content flickering out.
    assert.ok(
      keys.length >= previous.length,
      `rail count went backwards: ${previous.join(',')} -> ${keys.join(',')}`
    );
    // Earlier rails keep their positions as later ones arrive.
    assert.deepEqual(keys.slice(0, previous.length), previous);
    previous = keys;
  }

  assert.deepEqual(final.map((module) => module.key), previous);
});

test('every partial is already sorted for display', () => {
  const { partials } = drain(largeInput({
    origin: { latitude: 28.4177, longitude: -81.5812 },
  }));
  for (const step of partials) {
    const orders = step.modules.map((module) => module.sortOrder);
    assert.deepEqual(
      orders,
      [...orders].sort((a, b) => a - b),
      'a partial must be renderable as-is, not pending a final sort'
    );
    // finalizeModules drops empties; an empty rail would render as a bare
    // heading with nothing under it.
    for (const module of step.modules) assert.ok(module.items.length > 0);
  }
});

test('the generator terminates and is not accidentally infinite', () => {
  const steps = buildFindFeedSteps(largeInput());
  let count = 0;
  let step = steps.next();
  while (!step.done) {
    step = steps.next();
    if (++count > 10_000) assert.fail('generator did not terminate');
  }
  assert.ok(count > 1, 'expected more than one chunk');
});
