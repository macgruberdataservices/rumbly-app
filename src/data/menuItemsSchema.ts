// Schema ownership for db.ts's menu_items table, split out from it for the
// same reason activitySql.ts and journalSchema.ts are separate: this file
// imports nothing from the Expo runtime, only the SqlDatabase interface, so
// the migration path can be exercised against an in-memory SQLite adapter
// in Node rather than only ever running for the first time on a user's
// device. Getting a migration wrong here breaks existing installs, so it
// gets a regression test.

import type { SqlDatabase } from './sqlDatabase.ts';

const MENU_ITEMS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id TEXT NOT NULL,
    item_id TEXT,
    item TEXT,
    norm_item TEXT,
    description TEXT,
    category TEXT,
    category_group TEXT,
    group_display_order INTEGER,
    dining_period TEXT,
    price_display TEXT,
    price_value REAL,
    price_changed TEXT,
    previous_price REAL,
    is_seasonal INTEGER,
    is_limited_time INTEGER,
    is_allergy_friendly INTEGER,
    is_kids INTEGER,
    is_alcoholic INTEGER,
    has_allergy_option INTEGER,
    allergens TEXT,
    allergy_free_of TEXT,
    is_festival_item INTEGER,
    show_in_menu INTEGER,
    norm_categories TEXT,
    cuisine_tags TEXT,
    festival_name TEXT,
    festival_year INTEGER,
    first_seen TEXT,
    last_seen TEXT,
    queried_facility_id TEXT,
    fetched_from_facility_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON menu_items(restaurant_id);
`;

// CREATE TABLE IF NOT EXISTS is a no-op on any device that already has
// this table from a prior session -- it does NOT retroactively add new
// columns to an existing local file. Found 2026-07-27 while adding
// allergens/allergy_free_of: without this, the next reimport on an
// already-used device (triggered by LOCAL_DATA_SCHEMA_VERSION's bump)
// would throw a real SQL error inserting into columns that don't exist,
// not just serve stale data. Idempotent, cheap (one PRAGMA read), and
// the pattern to follow for any future menu_items column addition --
// add the column to both the CREATE TABLE above (for genuinely new
// installs) and this list (for existing ones).
const MIGRATION_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'allergens', ddl: 'ALTER TABLE menu_items ADD COLUMN allergens TEXT;' },
  { name: 'allergy_free_of', ddl: 'ALTER TABLE menu_items ADD COLUMN allergy_free_of TEXT;' },
  { name: 'norm_item', ddl: 'ALTER TABLE menu_items ADD COLUMN norm_item TEXT;' },
];

// Deliberately created after the migration pass, not inside
// MENU_ITEMS_SCHEMA_SQL above: on an install that predates norm_item the
// column doesn't exist until its ALTER TABLE has run, and CREATE INDEX on a
// missing column is a hard SQL error, not a silent no-op.
//
// norm_item holds normalizeForSearch(item) -- already lowercased and
// diacritic-stripped -- so a plain BINARY index serves both matching tiers
// search needs: `norm_item = ?` seeks, and a prefix match expressed as the
// range `norm_item >= ? AND norm_item < ?` scans only the matching span.
// (A LIKE 'q%' would NOT use this index by default; the query step should
// express prefixes as that range.)
//
// restaurant_id and item_id ride along to make the index covering for the
// match phase: every search needs them regardless of filter state -- one to
// resolve the item against the in-memory restaurants array, one for the
// restaurant_id:item_id dedupe key -- so including them lets the broad
// substring case scan the index alone instead of the full 46k-row table.
// Widening this further (the visibility columns) would be another schema
// bump and forced reimport, so it's a decision to make with the query, not
// ahead of it.
const NORM_ITEM_INDEX_SQL =
  'CREATE INDEX IF NOT EXISTS idx_menu_items_norm_item ON menu_items(norm_item, restaurant_id, item_id);';

export async function ensureMenuItemsSchema(db: SqlDatabase): Promise<void> {
  await db.execAsync(MENU_ITEMS_SCHEMA_SQL);
  const existing = new Set(
    (await db.getAllAsync<{ name: string }>('PRAGMA table_info(menu_items);')).map((c) => c.name)
  );
  for (const column of MIGRATION_COLUMNS) {
    if (!existing.has(column.name)) {
      await db.execAsync(column.ddl);
    }
  }
  await db.execAsync(NORM_ITEM_INDEX_SQL);
}
