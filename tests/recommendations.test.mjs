import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFindFeed } from '../src/recommendations/engine.ts';

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
    first_seen: '2026-07-01',
    ...overrides,
  };
}

function activity(overrides = {}) {
  return {
    lovedRestaurants: [],
    lovedItems: [],
    neededItems: [],
    gotItHistory: [],
    totalGotItCount: 0,
    ratedGotItCount: 0,
    ...overrides,
  };
}

function event({
  restaurantId,
  itemId = null,
  activityType,
  rating = null,
}) {
  return {
    clientId: `${restaurantId}:${itemId ?? ''}:${activityType}`,
    targetType: itemId ? 'item' : 'restaurant',
    restaurantId,
    itemId,
    activityType,
    rating,
    occurredAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
  };
}

const base = {
  events: [],
  content: [],
  configs: [],
  origin: null,
  isEntitled: () => true,
  now: new Date('2026-07-27T12:00:00.000Z'),
};

test('a highly rated Got It item drives similar recommendations', () => {
  const restaurants = [restaurant('rated'), restaurant('candidate')];
  const searchIndex = [
    item('rated', 'rated-burger', 'Burgers'),
    item('candidate', 'next-burger', 'Burgers'),
    item('candidate', 'unrelated-salad', 'Salads'),
  ];
  const modules = buildFindFeed({
    ...base,
    restaurants,
    searchIndex,
    activity: activity({
      gotItHistory: [event({
        restaurantId: 'rated',
        itemId: 'rated-burger',
        activityType: 'got_it',
        rating: 5,
      })],
    }),
  });
  const forYou = modules.find((module) => module.key === 'for_you');
  assert.ok(forYou);
  assert.equal(forYou.items[0].kind, 'item');
  assert.equal(forYou.items[0].item.item_id, 'next-burger');
});

test('a low Got It rating suppresses similar candidates without stronger positive signals', () => {
  const restaurants = [
    restaurant('rated', { primary_cuisine: null, service_style: null, price_tier: null }),
    restaurant('candidate', { primary_cuisine: null, service_style: null, price_tier: null }),
  ];
  const modules = buildFindFeed({
    ...base,
    restaurants,
    searchIndex: [
      item('rated', 'rated-burger', 'Burgers'),
      item('candidate', 'next-burger', 'Burgers'),
    ],
    activity: activity({
      gotItHistory: [event({
        restaurantId: 'rated',
        itemId: 'rated-burger',
        activityType: 'got_it',
        rating: 1,
      })],
    }),
  });
  assert.equal(modules.some((module) => module.key === 'for_you'), false);
});

test('Need It nearby is location-gated and sorted by distance', () => {
  const restaurants = [
    restaurant('near', { lat: 28.4005, lng: -81.5 }),
    restaurant('far', { lat: 28.45, lng: -81.5 }),
  ];
  const neededItems = [
    event({ restaurantId: 'far', itemId: 'far-item', activityType: 'need_it' }),
    event({ restaurantId: 'near', itemId: 'near-item', activityType: 'need_it' }),
  ];
  const common = {
    ...base,
    restaurants,
    searchIndex: [
      item('near', 'near-item', 'Snacks'),
      item('far', 'far-item', 'Snacks'),
    ],
    activity: activity({ neededItems }),
  };
  assert.equal(
    buildFindFeed(common).some((module) => module.key === 'nearby_need_it'),
    false
  );
  const nearby = buildFindFeed({
    ...common,
    origin: { latitude: 28.4, longitude: -81.5 },
  }).find((module) => module.key === 'nearby_need_it');
  assert.ok(nearby);
  assert.equal(nearby.items[0].kind, 'item');
  assert.equal(nearby.items[0].item.item_id, 'near-item');
});

test('the entire feed can be gated by an entitlement', () => {
  const modules = buildFindFeed({
    ...base,
    restaurants: [restaurant('candidate')],
    searchIndex: [item('candidate', 'festival-item', 'Snacks', { is_festival_item: true })],
    activity: activity(),
    configs: [{
      moduleKey: 'find_feed',
      enabled: true,
      sortOrder: 0,
      maxItems: 1,
      requiredEntitlement: 'find_feed',
      settings: {},
    }],
    isEntitled: () => false,
  });
  assert.deepEqual(modules, []);
});

test('For you removes duplicate dish names and limits restaurant repetition', () => {
  const restaurants = [
    restaurant('rated'),
    restaurant('one'),
    restaurant('two'),
    restaurant('three'),
  ];
  const modules = buildFindFeed({
    ...base,
    restaurants,
    searchIndex: [
      item('rated', 'rated-starter', 'Appetizers'),
      item('one', 'salad-one', 'Appetizers', { item: 'Ale & Compass Salad' }),
      item('two', 'salad-two', 'Starters', { item: 'Ale & Compass Salad®' }),
      item('two', 'unique-two', 'Appetizers', { item: 'Crab Cake' }),
      item('three', 'unique-three', 'Appetizers', { item: 'Tuna Nachos' }),
    ],
    activity: activity({
      gotItHistory: [event({
        restaurantId: 'rated',
        itemId: 'rated-starter',
        activityType: 'got_it',
        rating: 5,
      })],
    }),
  });
  const forYou = modules.find((module) => module.key === 'for_you');
  assert.ok(forYou);
  const items = forYou.items.filter((recommendation) => recommendation.kind === 'item');
  const saladCount = items.filter((recommendation) =>
    recommendation.item.item.replace('®', '') === 'Ale & Compass Salad'
  ).length;
  assert.equal(saladCount, 1);
  assert.equal(
    new Set(items.map((recommendation) => recommendation.restaurant.restaurant_id)).size,
    items.length
  );
});

test('equal recommendation scores use stable rotating order instead of item-name order', () => {
  const restaurants = [
    restaurant('rated'),
    restaurant('alpha'),
    restaurant('beta'),
    restaurant('gamma'),
  ];
  const input = {
    ...base,
    restaurants,
    searchIndex: [
      item('rated', 'rated-dessert', 'Desserts'),
      item('alpha', 'a-id', 'Desserts', { item: 'Alpha' }),
      item('beta', 'm-id', 'Desserts', { item: 'Beta' }),
      item('gamma', 'z-id', 'Desserts', { item: 'Gamma' }),
    ],
    activity: activity({
      gotItHistory: [event({
        restaurantId: 'rated',
        itemId: 'rated-dessert',
        activityType: 'got_it',
        rating: 5,
      })],
    }),
  };
  const first = buildFindFeed(input).find((module) => module.key === 'for_you');
  const second = buildFindFeed(input).find((module) => module.key === 'for_you');
  assert.ok(first);
  assert.ok(second);
  const firstNames = first.items
    .filter((recommendation) => recommendation.kind === 'item')
    .map((recommendation) => recommendation.item.item);
  const secondNames = second.items
    .filter((recommendation) => recommendation.kind === 'item')
    .map((recommendation) => recommendation.item.item);
  assert.deepEqual(firstNames, secondNames);
  assert.notDeepEqual(firstNames, [...firstNames].sort());
});

test('new-at-loved rotates across restaurants before showing a second item', () => {
  const restaurants = [
    restaurant('favorite-a'),
    restaurant('favorite-b'),
    restaurant('favorite-c'),
  ];
  const lovedRestaurants = restaurants.map((candidate) => event({
    restaurantId: candidate.restaurant_id,
    activityType: 'love_it',
  }));
  const modules = buildFindFeed({
    ...base,
    restaurants,
    searchIndex: [
      item('favorite-a', 'a-one', 'Entrées', { item: 'A One' }),
      item('favorite-a', 'a-two', 'Entrées', { item: 'A Two' }),
      item('favorite-a', 'a-three', 'Entrées', { item: 'A Three' }),
      item('favorite-b', 'b-one', 'Entrées', { item: 'B One' }),
      item('favorite-b', 'b-two', 'Entrées', { item: 'B Two' }),
      item('favorite-c', 'c-one', 'Entrées', { item: 'C One' }),
    ],
    activity: activity({ lovedRestaurants }),
  });
  const newAtLoved = modules.find((module) => module.key === 'new_at_loved');
  assert.ok(newAtLoved);
  const restaurantIds = newAtLoved.items
    .filter((recommendation) => recommendation.kind === 'item')
    .map((recommendation) => recommendation.restaurant.restaurant_id);
  assert.equal(new Set(restaurantIds.slice(0, 3)).size, 3);
  assert.ok(
    [...new Set(restaurantIds)].every((restaurantId) =>
      restaurantIds.filter((candidate) => candidate === restaurantId).length <= 2
    )
  );
});
