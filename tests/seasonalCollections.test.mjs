import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { dedupeSeasonalCollectionItems } from '../src/data/seasonalCollections.ts';
import { buildGeneralSeasonalCollectionQuery } from '../src/data/seasonalCollectionQuery.ts';

function item(overrides = {}) {
  return {
    restaurant_id: 'plaza-restaurant',
    item_id: 'standard',
    item: 'Skull Meatloaf',
    description: 'Caribbean-style Glazed Meatloaf',
    category: 'Halloween Offerings',
    category_group: 'halloween-offerings',
    group_display_order: 1,
    dining_period: 'Dinner',
    price_display: '$27.00',
    price_value: 27,
    price_changed: null,
    previous_price: null,
    is_seasonal: false,
    is_limited_time: false,
    is_allergy_friendly: false,
    is_kids: false,
    is_alcoholic: false,
    has_allergy_option: false,
    allergens: [],
    allergy_free_of: [],
    is_festival_item: false,
    show_in_menu: true,
    norm_categories: [],
    cuisine_tags: [],
    festival_name: null,
    festival_year: null,
    first_seen: '2026-08-08',
    last_seen: '2026-08-12',
    queried_facility_id: null,
    fetched_from_facility_id: null,
    ...overrides,
  };
}

test('seasonal product dedupe collapses meal periods and allergy-description variants', () => {
  const standard = item();
  const lunch = item({ dining_period: 'Lunch' });
  const allergyVariant = item({
    item_id: 'allergy',
    description: 'Caribbean-style Glazed Meatloaf (for Fish/Shellfish and Sesame Allergies)',
  });
  const elsewhere = item({ restaurant_id: 'another-restaurant', item_id: 'elsewhere' });

  const result = dedupeSeasonalCollectionItems([allergyVariant, lunch, elsewhere, standard]);

  assert.equal(result.length, 2);
  assert.equal(result.find((entry) => entry.restaurant_id === 'plaza-restaurant')?.item_id, 'standard');
  assert.ok(result.some((entry) => entry.restaurant_id === 'another-restaurant'));
});

test('general seasonal query hides with zero current matches and excludes party identities', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE menu_items (
      restaurant_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item TEXT NOT NULL,
      category_group TEXT NOT NULL,
      dining_period TEXT NOT NULL,
      show_in_menu INTEGER NOT NULL
    );
    INSERT INTO menu_items VALUES
      ('aloha-isle', 'general-only', 'Mango Float', 'halloween-exclusives', 'Snack', 1),
      ('auntie-gravitys', 'both', 'Cauldron Cold Brew', 'halloween-exclusives', 'Snack', 1),
      ('auntie-gravitys', 'both', 'Cauldron Cold Brew', 'halloween-exclusives', 'Special Ticketed Event', 1),
      ('hidden-place', 'hidden', 'Hidden Treat', 'halloween-offerings', 'Snack', 0),
      ('regular-place', 'regular', 'Regular Treat', 'desserts', 'Snack', 1);
  `);

  const query = buildGeneralSeasonalCollectionQuery(
    ['halloween-offerings', 'halloween-exclusive', 'halloween-exclusives'],
    ['mickeys-not-so-scary-halloween-party-exclusives', 'halloween-exclusives']
  );
  assert.ok(query);

  const visible = db.prepare(query.sql).all(query.params);
  assert.deepEqual(visible.map((row) => row.item_id), ['general-only']);

  db.prepare("DELETE FROM menu_items WHERE item_id = 'general-only'").run();
  assert.equal(db.prepare(query.sql).all(query.params).length, 0);
  db.close();
});
