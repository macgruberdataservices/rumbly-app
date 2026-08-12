import assert from 'node:assert/strict';
import test from 'node:test';

import { groupRestaurants } from '../src/data/groups.ts';

function restaurant(name, overrides = {}) {
  return { restaurant_id: name.toLowerCase().replace(/\W+/g, '-'), restaurant: name, park: null, area: null, resort: null, ...overrides };
}

const keys = (restaurants) => groupRestaurants(restaurants).map((g) => g.key);

test('BoardWalk venues get their own card instead of falling into Other', () => {
  const groups = groupRestaurants([
    restaurant('Flying Fish', { area: 'EPCOT Resort Area', venue: "Disney's BoardWalk" }),
    restaurant('AbracadaBar', { area: 'EPCOT Resort Area', venue: "Disney's BoardWalk" }),
  ]);

  assert.deepEqual(groups.map((g) => g.key), ["Disney's BoardWalk"]);
  assert.equal(groups[0].label, "Disney's BoardWalk");
  assert.deepEqual(groups[0].restaurants.map((r) => r.restaurant), ['AbracadaBar', 'Flying Fish']);
});

test('Wide World of Sports folds in with the resorts rather than taking a card', () => {
  const groups = groupRestaurants([
    restaurant('ESPN Wide World of Sports Grill', {
      area: 'Wide World of Sports Resort Area',
      venue: 'ESPN Wide World of Sports Complex',
    }),
    restaurant('Trattoria al Forno', { area: 'Magic Kingdom Resort Area', resort: "Disney's Contemporary Resort" }),
  ]);

  assert.deepEqual(groups.map((g) => g.key), ['Disney Resorts']);
  assert.equal(groups[0].restaurants.length, 2);
});

test('venue grouping cannot move a restaurant that already classifies', () => {
  const springsLand = restaurant('The Boathouse', { area: 'The Landing', venue: 'Disney Springs' });
  const inPark = restaurant('Space 220', { park: 'EPCOT', area: 'World Showcase', venue: 'Disney Springs' });
  const atResort = restaurant('Ale & Compass', {
    area: 'EPCOT Resort Area',
    resort: "Disney's Yacht Club Resort",
    venue: "Disney's BoardWalk",
  });

  assert.deepEqual(keys([springsLand]), ['Disney Springs']);
  assert.deepEqual(keys([inPark]), ['EPCOT']);
  assert.deepEqual(keys([atResort]), ['Disney Resorts']);
});

test('Other survives for venues Disney files loosely', () => {
  // Tyler's Coffee Bar shape: a resort-area string and nothing else. Disney's
  // facility doc gives it no park, no resort and no entertainment venue.
  assert.deepEqual(keys([restaurant("Tyler's Coffee Bar", { area: 'Disney Springs Resort Area' })]), ['Other']);
});

test('browse order puts the two dining districts ahead of the resort list', () => {
  const groups = groupRestaurants([
    restaurant('Boathouse', { area: 'West Side', venue: 'Disney Springs' }),
    restaurant('Ale & Compass', { resort: "Disney's Yacht Club Resort" }),
    restaurant('Flying Fish', { area: 'EPCOT Resort Area', venue: "Disney's BoardWalk" }),
    restaurant('Cosmic Ray', { park: 'Magic Kingdom Park' }),
    restaurant('Leaning Palms', { park: "Disney's Typhoon Lagoon Water Park" }),
    restaurant('Mystery Cart', { area: 'Somewhere New' }),
  ]);

  assert.deepEqual(groups.map((g) => g.key), [
    'Magic Kingdom Park',
    'Disney Springs',
    "Disney's BoardWalk",
    'Disney Resorts',
    'Water Parks',
    'Other',
  ]);
});
