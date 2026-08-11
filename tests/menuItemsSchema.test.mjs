import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ensureMenuItemsSchema } from '../src/data/menuItemsSchema.ts';
import { normalizeForSearch } from '../src/data/diacritics.ts';

class AsyncNodeSqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }

  async execAsync(source) {
    this.database.exec(source);
  }

  async runAsync(source, params) {
    const result = params
      ? this.database.prepare(source).run(params)
      : this.database.prepare(source).run();
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync(source, params) {
    return params
      ? (this.database.prepare(source).get(params) ?? null)
      : (this.database.prepare(source).get() ?? null);
  }

  async getAllAsync(source, params) {
    return params
      ? this.database.prepare(source).all(params)
      : this.database.prepare(source).all();
  }

  close() {
    this.database.close();
  }
}

function makeDatabase(t) {
  const db = new AsyncNodeSqlite();
  t.after(() => db.close());
  return db;
}

async function columnNames(db) {
  const columns = await db.getAllAsync('PRAGMA table_info(menu_items);');
  return columns.map((column) => column.name);
}

async function indexNames(db) {
  const indexes = await db.getAllAsync('PRAGMA index_list(menu_items);');
  return indexes.map((index) => index.name);
}

// The v6-era table: no allergens/allergy_free_of, no norm_item. Stands in
// for a device that has not reimported since before those columns existed.
const LEGACY_SCHEMA_SQL = `
  CREATE TABLE menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id TEXT NOT NULL,
    item_id TEXT,
    item TEXT,
    description TEXT,
    category TEXT,
    dining_period TEXT,
    show_in_menu INTEGER
  );
`;

test('a fresh database gets norm_item and its index', async (t) => {
  const db = makeDatabase(t);
  await ensureMenuItemsSchema(db);

  assert.ok((await columnNames(db)).includes('norm_item'));
  assert.ok((await indexNames(db)).includes('idx_menu_items_norm_item'));
});

test('the norm_item index covers the columns every match needs', async (t) => {
  const db = makeDatabase(t);
  await ensureMenuItemsSchema(db);

  // Asserted structurally rather than through EXPLAIN QUERY PLAN: whether
  // the planner picks a covering-index scan depends on table width and row
  // count, so a plan assertion passes or fails for reasons unrelated to the
  // thing worth protecting. What matters is that the index carries the three
  // columns the match phase reads -- norm_item to match on, restaurant_id to
  // resolve the item, item_id for the dedupe key -- so a broad substring
  // query can be answered without touching the 30-column table. Narrowing
  // this index would quietly undo that.
  const indexed = await db.getAllAsync('PRAGMA index_info(idx_menu_items_norm_item);');
  assert.deepEqual(
    indexed.map((column) => column.name),
    ['norm_item', 'restaurant_id', 'item_id']
  );
});

test('an install predating norm_item is migrated without losing its rows', async (t) => {
  const db = makeDatabase(t);
  await db.execAsync(LEGACY_SCHEMA_SQL);
  await db.runAsync(
    `INSERT INTO menu_items (restaurant_id, item_id, item, show_in_menu)
     VALUES ('lotus-blossom-cafe', '17131952', 'Pork Egg Rolls', 1);`
  );

  await ensureMenuItemsSchema(db);

  const columns = await columnNames(db);
  for (const added of ['allergens', 'allergy_free_of', 'norm_item']) {
    assert.ok(columns.includes(added), `expected ${added} to be added`);
  }
  assert.ok((await indexNames(db)).includes('idx_menu_items_norm_item'));

  // ALTER TABLE preserves existing rows but cannot backfill the new column.
  // LOCAL_DATA_SCHEMA_VERSION's bump is what forces the reimport that does.
  const row = await db.getFirstAsync('SELECT item, norm_item FROM menu_items;');
  assert.equal(row.item, 'Pork Egg Rolls');
  assert.equal(row.norm_item, null);
});

test('ensureMenuItemsSchema is idempotent across repeated opens', async (t) => {
  const db = makeDatabase(t);
  await ensureMenuItemsSchema(db);
  await ensureMenuItemsSchema(db);
  await ensureMenuItemsSchema(db);

  const columns = await columnNames(db);
  assert.equal(columns.filter((name) => name === 'norm_item').length, 1);
  assert.equal(
    (await indexNames(db)).filter((name) => name === 'idx_menu_items_norm_item').length,
    1
  );
});

test('the norm_item index serves equality and prefix-range lookups', async (t) => {
  const db = makeDatabase(t);
  await ensureMenuItemsSchema(db);

  const items = ['Pork Egg Rolls', 'Pork Belly Bao', 'Citricos Salad', 'Churro Bites'];
  for (const item of items) {
    await db.runAsync(
      `INSERT INTO menu_items (restaurant_id, item_id, item, norm_item, show_in_menu)
       VALUES ($restaurant_id, $item_id, $item, $norm_item, 1);`,
      {
        $restaurant_id: 'r1',
        $item_id: item,
        $item: item,
        $norm_item: normalizeForSearch(item),
      }
    );
  }

  // Prefix expressed as a range, not LIKE 'q%' -- the range is what the
  // BINARY index can actually seek on. Guarding this here so the query step
  // does not silently regress to a form that scans.
  const plan = await db.getAllAsync(
    `EXPLAIN QUERY PLAN
     SELECT item_id FROM menu_items WHERE norm_item >= 'pork' AND norm_item < 'porl';`
  );
  assert.match(
    plan.map((row) => row.detail).join(' '),
    /idx_menu_items_norm_item/,
    'prefix range should use the norm_item index'
  );

  const prefixed = await db.getAllAsync(
    `SELECT item_id FROM menu_items WHERE norm_item >= 'pork' AND norm_item < 'porl' ORDER BY norm_item;`
  );
  assert.deepEqual(prefixed.map((row) => row.item_id), ['Pork Belly Bao', 'Pork Egg Rolls']);

  const exact = await db.getFirstAsync(
    `SELECT item_id FROM menu_items WHERE norm_item = 'churro bites';`
  );
  assert.equal(exact.item_id, 'Churro Bites');
});

test('norm_item matches the projection search_index.json already carries', async (t) => {
  const db = makeDatabase(t);
  await ensureMenuItemsSchema(db);

  // Accented source text must normalize identically on both sides, which is
  // the whole reason the projection is precomputed rather than derived per
  // keystroke. "Citricos" with an accent must be findable as typed plain.
  const accented = 'Cítricos Salad';
  await db.runAsync(
    `INSERT INTO menu_items (restaurant_id, item_id, item, norm_item, show_in_menu)
     VALUES ('r1', 'i1', $item, $norm_item, 1);`,
    { $item: accented, $norm_item: normalizeForSearch(accented) }
  );

  const row = await db.getFirstAsync(
    `SELECT item_id FROM menu_items WHERE norm_item = $q;`,
    { $q: normalizeForSearch('citricos salad') }
  );
  assert.equal(row.item_id, 'i1');
});
