import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areaDisplayName,
  locationHierarchy,
  parkDisplayName,
  restaurantLocationLabel,
} from '../src/data/locationNames.ts';

function restaurant(overrides = {}) {
  return {
    park: null,
    area: null,
    resort: null,
    ...overrides,
  };
}

test('park names use compact display labels', () => {
  assert.equal(parkDisplayName('Magic Kingdom Park'), 'Magic Kingdom');
  assert.equal(parkDisplayName("Disney's Hollywood Studios"), 'Hollywood Studios');
  assert.equal(parkDisplayName("Disney's Typhoon Lagoon Water Park"), 'Typhoon Lagoon');
});

test('administrative entrance areas use guest-facing labels', () => {
  assert.equal(areaDisplayName('Magic Kingdom Resort Area'), 'TTC');
  assert.equal(areaDisplayName('EPCOT Resort Area'), 'Epcot Park Entrance');
  assert.equal(areaDisplayName('Fantasyland'), 'Fantasyland');
});

test('hierarchy keeps raw keys while exposing display labels', () => {
  assert.deepEqual(
    locationHierarchy(restaurant({ park: 'Magic Kingdom Park', area: 'Magic Kingdom Resort Area' })),
    {
      topKey: 'Magic Kingdom Park',
      topLabel: 'Magic Kingdom',
      topOrder: 0,
      subKey: 'Magic Kingdom Resort Area',
      subLabel: 'TTC',
    }
  );

  assert.deepEqual(
    locationHierarchy(restaurant({ park: "Disney's Typhoon Lagoon Water Park", area: 'Typhoon Lagoon' })),
    {
      topKey: 'Water Parks',
      topLabel: 'Water Parks',
      topOrder: 40,
      subKey: "Disney's Typhoon Lagoon Water Park",
      subLabel: 'Typhoon Lagoon',
    }
  );

  assert.deepEqual(
    locationHierarchy(restaurant({ area: 'Magic Kingdom Resort Area', resort: "Disney's Polynesian Village Resort" })),
    {
      topKey: 'Disney Resorts',
      topLabel: 'Resorts',
      topOrder: 20,
      subKey: "Disney's Polynesian Village Resort",
      subLabel: "Disney's Polynesian Village Resort",
    }
  );
});

test('compact location labels prefer a real resort over an administrative area', () => {
  assert.equal(
    restaurantLocationLabel(restaurant({ park: 'EPCOT', area: 'EPCOT Resort Area' })),
    'Epcot Park Entrance'
  );
  assert.equal(
    restaurantLocationLabel(
      restaurant({ area: 'Magic Kingdom Resort Area', resort: "Disney's Contemporary Resort" })
    ),
    "Disney's Contemporary Resort"
  );
});
