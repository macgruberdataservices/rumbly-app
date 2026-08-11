// End-to-end equivalence between the two search paths.
//
// menuItemQuery.test.mjs proves SQL retrieves the right rows. This proves the
// thing that actually ships: for a given query, searchViaSql and the existing
// in-memory search() return identical result lists -- same items, same order,
// same tiers, same caps. Both call the same rank.ts, so any divergence means
// the candidate set differed, which is exactly the failure this port could
// plausibly have.
//
// Runs against the real cached dataset when present. On a machine that has
// never launched the app it falls back to a fixture, which exercises the
// mechanics but not the interesting collisions -- so the row count printed by
// the first test is worth reading before trusting a green run.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ensureMenuItemsSchema } from '../src/data/menuItemsSchema.ts';
import { normalizeForSearch } from '../src/data/diacritics.ts';
import { search } from '../src/search/rank.ts';
import { searchViaSql } from '../src/search/sqlSearch.ts';

class AsyncNodeSqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }
  async execAsync(source) { this.database.exec(source); }
  async runAsync(source, params) {
    const r = params ? this.database.prepare(source).run(params) : this.database.prepare(source).run();
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  }
  async getFirstAsync(source, params) {
    return params ? (this.database.prepare(source).get(params) ?? null) : (this.database.prepare(source).get() ?? null);
  }
  async getAllAsync(source, params) {
    return params ? this.database.prepare(source).all(params) : this.database.prepare(source).all();
  }
  close() { this.database.close(); }
}

function findCached(name) {
  const root = join(homedir(), 'Library/Developer/CoreSimulator/Devices');
  if (!existsSync(root)) return null;
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    if (entries.includes(name) && entries.includes('search_index.json')) {
      const path = join(dir, name);
      found.push({ path, mtime: statSync(path).mtimeMs });
      return;
    }
    for (const entry of entries) {
      const next = join(dir, entry);
      try { if (statSync(next).isDirectory()) walk(next, depth + 1); } catch { /* skip */ }
    }
  };
  walk(root, 0);
  if (found.length === 0) return null;
  found.sort((a, b) => b.mtime - a.mtime);
  return JSON.parse(readFileSync(found[0].path, 'utf8'));
}

const cachedIndex = findCached('search_index.json');
const cachedRestaurants = findCached('restaurant_data.json');

const FIXTURE_RESTAURANTS = [
  { restaurant_id: 'r1', restaurant: 'Lotus Blossom Cafe', show_in_app: true, lat: 28.4, lng: -81.5 },
  { restaurant_id: 'r2', restaurant: 'Cítricos', show_in_app: true, lat: 28.4, lng: -81.5 },
  { restaurant_id: 'r3', restaurant: 'Chicken Guy!', show_in_app: true, lat: 28.4, lng: -81.5 },
];
const FIXTURE_ITEMS = [
  { restaurant_id: 'r1', item_id: 'i1', item: 'Pork Egg Rolls', category: 'Appetizers' },
  { restaurant_id: 'r1', item_id: 'i2', item: 'Pork Belly Bao', category: 'Appetizers' },
  { restaurant_id: 'r2', item_id: 'i3', item: 'Cítricos Salad', category: 'Salads' },
  { restaurant_id: 'r2', item_id: 'i4', item: 'Churro Bites', category: 'Desserts' },
  { restaurant_id: 'r3', item_id: 'i5', item: 'Chicken Sandwich', category: 'Entrees' },
  { restaurant_id: 'r3', item_id: 'i6', item: 'Grilled Chicken Plate', category: 'Entrees' },
];

const restaurants = cachedRestaurants ?? FIXTURE_RESTAURANTS;
const index = (() => {
  const source = cachedIndex ?? FIXTURE_ITEMS;
  const seen = new Set();
  return source.filter((item) => {
    const key = `${item.restaurant_id}:${item.item_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
})();

// The in-memory path reads these off the entry, so the fixture has to carry
// them or the two paths would differ for reasons unrelated to retrieval.
function normalizeEntry(item) {
  return {
    ...item,
    _norm: item._norm ?? normalizeForSearch(item.item),
    category: item.category ?? '',
    norm_categories: item.norm_categories ?? [],
    dining_period: item.dining_period ?? 'Lunch',
    price_display: item.price_display ?? '',
    show_in_menu: item.show_in_menu ?? true,
    is_festival_item: item.is_festival_item ?? false,
    is_kids: item.is_kids ?? false,
    is_allergy_friendly: item.is_allergy_friendly ?? false,
    has_allergy_option: item.has_allergy_option ?? false,
    allergens: item.allergens ?? [],
    allergy_free_of: item.allergy_free_of ?? [],
    first_seen: item.first_seen ?? '2026-07-01',
    description: item.description ?? null,
  };
}
const inMemoryIndex = index.map(normalizeEntry);

async function makeDatabase(t) {
  const db = new AsyncNodeSqlite();
  t.after(() => db.close());
  await ensureMenuItemsSchema(db);
  const insert = db.database.prepare(
    `INSERT INTO menu_items (restaurant_id, item_id, item, norm_item, category, price_display,
       price_changed, previous_price, show_in_menu, is_festival_item, dining_period,
       norm_categories, is_kids, is_allergy_friendly, has_allergy_option, allergens,
       allergy_free_of, first_seen, description)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  db.database.exec('BEGIN');
  for (const e of inMemoryIndex) {
    insert.run(
      e.restaurant_id, e.item_id, e.item, e._norm, e.category, e.price_display,
      e.price_changed ?? null, e.previous_price ?? null, e.show_in_menu ? 1 : 0,
      e.is_festival_item ? 1 : 0, e.dining_period, JSON.stringify(e.norm_categories),
      e.is_kids ? 1 : 0, e.is_allergy_friendly ? 1 : 0, e.has_allergy_option ? 1 : 0,
      JSON.stringify(e.allergens), JSON.stringify(e.allergy_free_of), e.first_seen,
      e.description
    );
  }
  db.database.exec('COMMIT');
  return db;
}

// A result list compared by what a user would actually see change: which rows,
// in which order, at which tier.
function shapeOf(results) {
  return results.map((r) => {
    if (r.kind === 'restaurant') return `restaurant:${r.tier}:${r.restaurant.restaurant_id}`;
    if (r.kind === 'item') return `item:${r.tier}:${r.item.restaurant_id}:${r.item.item_id}`;
    return `related:${r.tier}:${r.tag.kind}:${r.tag.value}`;
  });
}

const QUERIES = [
  'pork',            // prefix, gate closed
  'chicken',         // broad substring
  'ch',              // 2-char minimum
  'citricos',        // precise, gate opens
  'churro',
  'egg rolls',
  'Cítricos',        // accented input
  'CHICKEN',         // case
  'citricoss',       // misspelling, fuzzy
  'chickn',          // transposition-ish
  'zzzznotathing',   // no match at all
  'ic',
];

test(`dataset: ${cachedIndex ? `${index.length} real rows` : 'fixture'}, ${restaurants.length} restaurants`, () => {
  assert.ok(index.length > 0);
});

test('both paths return identical results for every query', async (t) => {
  const db = await makeDatabase(t);
  for (const query of QUERIES) {
    const expected = search(query, restaurants, inMemoryIndex);
    const actual = await searchViaSql(db, query, restaurants);
    assert.deepEqual(
      shapeOf(actual.results),
      shapeOf(expected),
      `diverged for ${JSON.stringify(query)}`
    );
  }
});

test('identical under an allergy/dietary filter too', async (t) => {
  const db = await makeDatabase(t);
  for (const query of ['chicken', 'citricos', 'pork']) {
    for (const [dietary, allow] of [[new Set(), true], [new Set(['gluten']), false]]) {
      const expected = search(query, restaurants, inMemoryIndex, dietary, allow);
      const actual = await searchViaSql(db, query, restaurants, dietary, allow);
      assert.deepEqual(
        shapeOf(actual.results),
        shapeOf(expected),
        `diverged for ${query} with dietary=${[...dietary]} allow=${allow}`
      );
    }
  }
});

test('the second query runs only when the fuzzy fallback would have', async (t) => {
  const db = await makeDatabase(t);
  // Broad queries already clear the gate, so they must never pay for it.
  const broad = await searchViaSql(db, 'chicken', restaurants);
  assert.equal(broad.usedFuzzyPass, false, 'a broad query must not fetch fuzzy candidates');

  // A query that matches nothing strictly is exactly when the fallback exists.
  const miss = await searchViaSql(db, 'citricoss', restaurants);
  assert.equal(miss.usedFuzzyPass, true, 'a near-miss must fetch fuzzy candidates');
});

test('queries too short to fuzzy-match never fetch fuzzy candidates', async (t) => {
  const db = await makeDatabase(t);
  // rank.ts gates item fuzzy on q.length >= 5, so anything shorter is waste.
  for (const query of ['ic', 'ch', 'pork']) {
    const outcome = await searchViaSql(db, query, restaurants);
    assert.equal(outcome.usedFuzzyPass, false, `${query} should skip the fuzzy query`);
  }
});

test('an empty or whitespace query short-circuits without touching SQL', async (t) => {
  const db = await makeDatabase(t);
  for (const query of ['', '   ']) {
    const outcome = await searchViaSql(db, query, restaurants);
    assert.deepEqual(outcome.results, []);
    assert.equal(outcome.strictCandidateCount, 0);
  }
});
