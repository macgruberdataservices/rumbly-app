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

test('Need It nearby only includes items within actual walking distance, not anywhere within the old 5-mile radius', () => {
  const restaurants = [
    restaurant('close', { lat: 28.403 }), // ~0.21 mi from origin
    restaurant('too-far', { lat: 28.412 }), // ~0.83 mi -- inside the old 5 mi cutoff, outside the new 0.5 mi one
  ];
  const nearby = buildFindFeed({
    ...base,
    origin: { latitude: 28.4, longitude: -81.5 },
    restaurants,
    searchIndex: [
      item('close', 'close-item', 'Snacks'),
      item('too-far', 'too-far-item', 'Snacks'),
    ],
    activity: activity({
      neededItems: [
        event({ restaurantId: 'close', itemId: 'close-item', activityType: 'need_it' }),
        event({ restaurantId: 'too-far', itemId: 'too-far-item', activityType: 'need_it' }),
      ],
    }),
  }).find((module) => module.key === 'nearby_need_it');
  assert.ok(nearby);
  const itemIds = nearby.items
    .filter((recommendation) => recommendation.kind === 'item')
    .map((recommendation) => recommendation.item.item_id);
  assert.ok(itemIds.includes('close-item'), 'something ~0.2 mi away still counts as nearby');
  assert.equal(itemIds.includes('too-far-item'), false, '~0.8 mi away no longer counts as nearby');
});

test('Need It nearby surfaces a restaurant-level Need It via a representative item, without duplicating a restaurant that already has an item-level entry', () => {
  const restaurants = [
    restaurant('whole-place', { lat: 28.4005, lng: -81.5 }),
    restaurant('both', { lat: 28.401, lng: -81.5 }),
  ];
  const searchIndex = [
    item('whole-place', 'signature-dish', 'Entrees'),
    item('both', 'picked-item', 'Snacks'),
    item('both', 'other-item', 'Snacks'),
  ];
  const nearby = buildFindFeed({
    ...base,
    origin: { latitude: 28.4, longitude: -81.5 },
    restaurants,
    searchIndex,
    activity: activity({
      neededRestaurants: [
        event({ restaurantId: 'whole-place', activityType: 'need_it' }),
        event({ restaurantId: 'both', activityType: 'need_it' }),
      ],
      neededItems: [
        event({ restaurantId: 'both', itemId: 'picked-item', activityType: 'need_it' }),
      ],
    }),
  }).find((module) => module.key === 'nearby_need_it');
  assert.ok(nearby);
  const restaurantIds = nearby.items
    .filter((recommendation) => recommendation.kind === 'item')
    .map((recommendation) => recommendation.restaurant.restaurant_id);
  assert.ok(restaurantIds.includes('whole-place'), 'a restaurant-level Need It now appears nearby');
  assert.equal(
    restaurantIds.filter((id) => id === 'both').length,
    1,
    'a restaurant with both an item-level and restaurant-level Need It only appears once'
  );
  const bothEntry = nearby.items.find(
    (recommendation) => recommendation.kind === 'item' && recommendation.restaurant.restaurant_id === 'both'
  );
  assert.equal(bothEntry.item.item_id, 'picked-item', 'the item-level entry wins over a synthesized representative');
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

test('New Bites uses the change log, rejects low-value and irrelevant allergy items, and does not fill', () => {
  const restaurants = [
    restaurant('rated'),
    restaurant('new-place'),
  ];
  const modules = buildFindFeed({
    ...base,
    restaurants,
    searchIndex: [
      item('rated', 'rated-burger', 'Burgers'),
      item('new-place', 'great-burger', 'Burgers', { item: 'Great Burger' }),
      item('new-place', 'fruit-cup', 'Sides', { item: 'Fresh Fruit Cup' }),
      item('new-place', 'allergy-burger', 'Burgers', {
        item: 'Allergy Burger',
        is_allergy_friendly: true,
      }),
    ],
    changes: [
      {
        date: '2026-07-25',
        category: 'menu_item_added',
        restaurant_id: 'new-place',
        item: 'Great Burger',
        menu_category: 'Burgers',
        dining_period: 'Lunch',
      },
      {
        date: '2026-07-25',
        category: 'menu_item_added',
        restaurant_id: 'new-place',
        item: 'Fresh Fruit Cup',
        menu_category: 'Sides',
        dining_period: 'Lunch',
      },
      {
        date: '2026-07-25',
        category: 'menu_item_added',
        restaurant_id: 'new-place',
        item: 'Allergy Burger',
        menu_category: 'Allergy-Friendly',
        dining_period: 'Lunch',
      },
    ],
    activity: activity({
      gotItHistory: [event({
        restaurantId: 'rated',
        itemId: 'rated-burger',
        activityType: 'got_it',
        rating: 5,
      })],
    }),
  });
  const newBites = modules.find((module) => module.key === 'new_bites');
  assert.ok(newBites);
  assert.equal(newBites.items.length, 1);
  assert.equal(newBites.items[0].kind, 'item');
  assert.equal(newBites.items[0].item.item, 'Great Burger');
});

test('What’s nearby requires taste relevance and the current meal period', () => {
  const modules = buildFindFeed({
    ...base,
    now: new Date(2026, 6, 27, 12, 0, 0),
    origin: { latitude: 28.4, longitude: -81.5 },
    restaurants: [
      restaurant('rated'),
      restaurant('lunch-near', { lat: 28.4005 }),
      restaurant('dinner-near', { lat: 28.4006 }),
    ],
    searchIndex: [
      item('rated', 'rated-burger', 'Burgers'),
      item('lunch-near', 'lunch-burger', 'Burgers', { dining_period: 'Lunch' }),
      item('dinner-near', 'dinner-burger', 'Burgers', { dining_period: 'Dinner' }),
    ],
    activity: activity({
      gotItHistory: [event({
        restaurantId: 'rated',
        itemId: 'rated-burger',
        activityType: 'got_it',
        rating: 5,
      })],
    }),
  });
  const nearby = modules.find((module) => module.key === 'nearby_for_you');
  assert.ok(nearby);
  assert.equal(nearby.items.length, 1);
  assert.equal(nearby.items[0].kind, 'item');
  assert.equal(nearby.items[0].item.item_id, 'lunch-burger');
});

test('What’s nearby treats snack/lounge periods as always available, and Late Night Dining as the dinner bucket', () => {
  const restaurants = [
    restaurant('rated'),
    restaurant('snack-near', { lat: 28.4005 }),
    restaurant('late-night-near', { lat: 28.4006 }),
  ];
  const searchIndex = [
    item('rated', 'rated-burger', 'Burgers'),
    item('snack-near', 'snack-burger', 'Burgers', { dining_period: 'Snack' }),
    item('late-night-near', 'late-burger', 'Burgers', { dining_period: 'Late Night Dining' }),
  ];
  const activityInput = activity({
    gotItHistory: [event({
      restaurantId: 'rated',
      itemId: 'rated-burger',
      activityType: 'got_it',
      rating: 5,
    })],
  });
  const common = {
    ...base,
    origin: { latitude: 28.4, longitude: -81.5 },
    restaurants,
    searchIndex,
    activity: activityInput,
  };

  const morning = buildFindFeed({ ...common, now: new Date(2026, 6, 27, 8, 0, 0) })
    .find((module) => module.key === 'nearby_for_you');
  assert.ok(morning);
  const morningIds = morning.items
    .filter((recommendation) => recommendation.kind === 'item')
    .map((recommendation) => recommendation.item.item_id);
  assert.ok(morningIds.includes('snack-burger'), 'Snack items show at any hour');
  assert.equal(morningIds.includes('late-burger'), false, 'Late Night Dining stays out of the breakfast bucket');

  const evening = buildFindFeed({ ...common, now: new Date(2026, 6, 27, 19, 0, 0) })
    .find((module) => module.key === 'nearby_for_you');
  assert.ok(evening);
  const eveningIds = evening.items
    .filter((recommendation) => recommendation.kind === 'item')
    .map((recommendation) => recommendation.item.item_id);
  assert.ok(eveningIds.includes('snack-burger'), 'Snack items still show in the evening');
  assert.ok(eveningIds.includes('late-burger'), 'Late Night Dining matches the dinner bucket');
});

test('What’s nearby is hidden without an enabled location origin', () => {
  const modules = buildFindFeed({
    ...base,
    origin: null,
    restaurants: [
      restaurant('rated'),
      restaurant('candidate'),
    ],
    searchIndex: [
      item('rated', 'rated-burger', 'Burgers'),
      item('candidate', 'candidate-burger', 'Burgers', { dining_period: 'Lunch' }),
    ],
    activity: activity({
      gotItHistory: [event({
        restaurantId: 'rated',
        itemId: 'rated-burger',
        activityType: 'got_it',
        rating: 5,
      })],
    }),
  });
  assert.equal(modules.some((module) => module.key === 'nearby_for_you'), false);
});

test('weak passive signals do not force a For You rail', () => {
  const modules = buildFindFeed({
    ...base,
    restaurants: [restaurant('viewed'), restaurant('candidate')],
    searchIndex: [
      item('viewed', 'viewed-dessert', 'Desserts'),
      item('candidate', 'candidate-dessert', 'Desserts'),
    ],
    events: [{
      eventType: 'view',
      targetType: 'item',
      restaurantId: 'viewed',
      itemId: 'viewed-dessert',
      contentId: null,
      occurredAt: '2026-07-27T11:00:00.000Z',
    }],
    activity: activity(),
  });
  assert.equal(modules.some((module) => module.key === 'for_you'), false);
});
