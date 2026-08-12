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

test('entertainment venue rescues restaurants Disney gives no park and no resort', () => {
  assert.deepEqual(
    locationHierarchy(restaurant({ area: 'EPCOT Resort Area', venue: "Disney's BoardWalk" })),
    {
      topKey: "Disney's BoardWalk",
      topLabel: "Disney's BoardWalk",
      topOrder: 35,
      // Never the area: areaDisplayName would render this one "Epcot Park
      // Entrance", which is the wrong place entirely for a BoardWalk venue.
      subKey: null,
      subLabel: null,
    }
  );

  assert.deepEqual(
    locationHierarchy(
      restaurant({ area: 'Wide World of Sports Resort Area', venue: 'ESPN Wide World of Sports Complex' })
    ),
    {
      topKey: 'Disney Resorts',
      topLabel: 'Resorts',
      topOrder: 20,
      subKey: 'ESPN Wide World of Sports Complex',
      subLabel: 'ESPN Wide World of Sports',
    }
  );

  assert.deepEqual(
    locationHierarchy(restaurant({ area: 'Disney Springs Resort Area', venue: 'Disney Springs' })),
    { topKey: 'Disney Springs', topLabel: 'Disney Springs', topOrder: 30, subKey: null, subLabel: null }
  );
});

test('venue never outranks a park, resort or Disney Springs land', () => {
  // The whole safety argument for adding venue grouping: it is the last check
  // before Other, so no restaurant that already classifies can move. A
  // Disney Springs restaurant keeps its land sub-heading rather than
  // collapsing into the venue's null one...
  assert.deepEqual(
    locationHierarchy(restaurant({ area: 'The Landing', venue: 'Disney Springs' })),
    { topKey: 'Disney Springs', topLabel: 'Disney Springs', topOrder: 30, subKey: 'The Landing', subLabel: 'The Landing' }
  );

  // ...and a venue value can never pull a restaurant out of its park or resort.
  assert.equal(
    locationHierarchy(restaurant({ park: 'EPCOT', area: 'World Showcase', venue: 'Disney Springs' })).topKey,
    'EPCOT'
  );
  assert.equal(
    locationHierarchy(
      restaurant({ resort: "Disney's Yacht Club Resort", area: 'EPCOT Resort Area', venue: "Disney's BoardWalk" })
    ).topKey,
    'Disney Resorts'
  );
});

test('an unknown or absent venue still falls through to Other', () => {
  // Records cached before the field shipped have no `venue` at all, and
  // hand-coded venues have no facility doc to read one from.
  assert.equal(locationHierarchy(restaurant({ area: 'Disney Springs Resort Area' })).topKey, 'Other');
  assert.equal(
    locationHierarchy(restaurant({ area: 'Somewhere New', venue: 'Some Future Venue' })).topKey,
    'Other'
  );
});
