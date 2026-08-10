import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ILLUSTRATION_SPECS,
  illustrationTagForMenuItem,
  illustrationTagForRestaurant,
} from '../src/illustrations/catalog.ts';

test('every illustration tag has swap-ready presentation metadata', () => {
  for (const [tagId, spec] of Object.entries(ILLUSTRATION_SPECS)) {
    assert.match(tagId, /^[a-z]+(?:[.-][a-z0-9]+)+\.v\d+$/);
    assert.ok(spec.label.length > 0);
    assert.ok(spec.brief.length > 0);
    assert.match(spec.backgroundColor, /^#[0-9A-F]{6}$/i);
    assert.match(spec.accentColor, /^#[0-9A-F]{6}$/i);
  }
});

test('menu artwork maps to reusable categories rather than item-specific tags', () => {
  assert.equal(illustrationTagForMenuItem('Beverages', 'Cold Brew'), 'menu.category.drinks.v1');
  assert.equal(illustrationTagForMenuItem('Desserts', 'Soft-serve Cup'), 'menu.category.sweets.v1');
  assert.equal(illustrationTagForMenuItem('Entrées', 'Grilled Chicken'), 'menu.category.entrees.v1');
  assert.equal(
    illustrationTagForMenuItem('Food and Wine Festival Offering', 'French Onion Burger'),
    'menu.category.entrees.v1'
  );
});

test('restaurant artwork maps to reusable service identities', () => {
  assert.equal(
    illustrationTagForRestaurant({ experience_type: 'Table Service', service_style: null }),
    'restaurant.identity.table-service.v1'
  );
  assert.equal(
    illustrationTagForRestaurant({ experience_type: null, service_style: 'Food Cart' }),
    'restaurant.identity.kiosk-cart.v1'
  );
  assert.equal(
    illustrationTagForRestaurant({ experience_type: 'Quick Service', service_style: null }),
    'restaurant.identity.quick-service.v1'
  );
});

test('second-pass companion surfaces have stable illustration contracts', () => {
  for (const tagId of [
    'journal.hero.memory-book.v1',
    'journal.composer.capture-memory.v1',
    'my-rumbly.hero.collection.v1',
    'ask.hero.companion.v1',
    'activity.state.empty.v1',
    'changes.hero.whats-new.v1',
  ]) {
    assert.ok(tagId in ILLUSTRATION_SPECS);
  }
});
