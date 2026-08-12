// The only indexed/on-demand-queried store in the app. Mirrors the source
// PWA's IDB_STORE_ITEMS: full menu item records (45k+, 28 fields each),
// never held fully in memory, fetched only by restaurant_id when a
// specific restaurant's menu screen opens. Restaurants and hours live in
// fileStore.ts instead — see that file for why.
//
// The search index is mid-migration out of fileStore.ts and into this
// table. search_index.json is still what rank.ts reads, but it costs a
// multi-megabyte synchronous JSON.parse on the JS thread before the first
// search can run, which is the single largest cost on the path from cold
// launch to results. The norm_item column added here (see
// menuItemsSchema.ts) is the target: the same normalized item name the
// JSON projection carries as `_norm`, indexed, so matching can happen in
// SQL with nothing to parse. Schema only so far — no query reads it yet.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { MenuItem } from './types';
import { normalizeForSearch } from './diacritics';
import { getDb as getSharedDb } from './sqlite';
import { asSqlDatabase } from './sqlDatabase';
import { ensureMenuItemsSchema } from './menuItemsSchema';
import { buildGeneralSeasonalCollectionQuery } from './seasonalCollectionQuery';

let readyPromise: Promise<SQLiteDatabase> | null = null;
let allMenuItemsPromise: Promise<MenuItem[]> | null = null;

function getDb(): Promise<SQLiteDatabase> {
  if (!readyPromise) {
    readyPromise = getSharedDb().then(async (db) => {
      await ensureMenuItemsSchema(asSqlDatabase(db));
      return db;
    });
  }
  return readyPromise;
}

const bool = (v: boolean): number => (v ? 1 : 0);
const json = (v: unknown): string => JSON.stringify(v ?? []);

export async function clearMenuItems(): Promise<void> {
  const db = await getDb();
  allMenuItemsPromise = null;
  await db.execAsync('DELETE FROM menu_items;');
}

// Chunked, single-transaction bulk insert via one prepared statement,
// executed once per row — the standard expo-sqlite pattern for large
// batches (avoids re-parsing SQL per row, keeps the transaction atomic).
export async function insertMenuItemsBatch(items: MenuItem[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const statement = await db.prepareAsync(`
      INSERT INTO menu_items (
        restaurant_id, item_id, item, norm_item, description, category, category_group,
        group_display_order, dining_period, price_display, price_value,
        price_changed, previous_price, is_seasonal, is_limited_time,
        is_allergy_friendly, is_kids, is_alcoholic, has_allergy_option,
        allergens, allergy_free_of,
        is_festival_item, show_in_menu, norm_categories, cuisine_tags,
        festival_name, festival_year, first_seen, last_seen,
        queried_facility_id, fetched_from_facility_id
      ) VALUES (
        $restaurant_id, $item_id, $item, $norm_item, $description, $category, $category_group,
        $group_display_order, $dining_period, $price_display, $price_value,
        $price_changed, $previous_price, $is_seasonal, $is_limited_time,
        $is_allergy_friendly, $is_kids, $is_alcoholic, $has_allergy_option,
        $allergens, $allergy_free_of,
        $is_festival_item, $show_in_menu, $norm_categories, $cuisine_tags,
        $festival_name, $festival_year, $first_seen, $last_seen,
        $queried_facility_id, $fetched_from_facility_id
      );
    `);
    try {
      for (const item of items) {
        await statement.executeAsync({
          $restaurant_id: item.restaurant_id,
          $item_id: item.item_id,
          $item: item.item,
          // Precomputed once at import rather than per keystroke: this is
          // the same projection search_index.json's `_norm` carries, moved
          // into the indexed store so matching can happen in SQL.
          $norm_item: normalizeForSearch(item.item),
          $description: item.description,
          $category: item.category,
          $category_group: item.category_group,
          $group_display_order: item.group_display_order,
          $dining_period: item.dining_period,
          $price_display: item.price_display,
          $price_value: item.price_value,
          $price_changed: item.price_changed,
          $previous_price: item.previous_price,
          $is_seasonal: bool(item.is_seasonal),
          $is_limited_time: bool(item.is_limited_time),
          $is_allergy_friendly: bool(item.is_allergy_friendly),
          $is_kids: bool(item.is_kids),
          $is_alcoholic: bool(item.is_alcoholic),
          $has_allergy_option: bool(item.has_allergy_option),
          $allergens: json(item.allergens),
          $allergy_free_of: json(item.allergy_free_of),
          $is_festival_item: bool(item.is_festival_item),
          $show_in_menu: bool(item.show_in_menu),
          $norm_categories: json(item.norm_categories),
          $cuisine_tags: json(item.cuisine_tags),
          $festival_name: item.festival_name,
          $festival_year: item.festival_year,
          $first_seen: item.first_seen,
          $last_seen: item.last_seen,
          $queried_facility_id: item.queried_facility_id,
          $fetched_from_facility_id: item.fetched_from_facility_id,
        });
      }
    } finally {
      await statement.finalizeAsync();
    }
  });
}

interface MenuItemRow {
  restaurant_id: string;
  item_id: string;
  item: string;
  // Null on rows written before the norm_item migration; the schema bump
  // that introduced it forces a reimport, so that state is transient.
  norm_item: string | null;
  description: string | null;
  category: string;
  category_group: string;
  group_display_order: number;
  dining_period: string;
  price_display: string;
  price_value: number;
  price_changed: string | null;
  previous_price: number | null;
  is_seasonal: number;
  is_limited_time: number;
  is_allergy_friendly: number;
  is_kids: number;
  is_alcoholic: number;
  has_allergy_option: number;
  allergens: string;
  allergy_free_of: string;
  is_festival_item: number;
  show_in_menu: number;
  norm_categories: string;
  cuisine_tags: string;
  festival_name: string | null;
  festival_year: number | null;
  first_seen: string;
  last_seen: string;
  queried_facility_id: string | null;
  fetched_from_facility_id: string | null;
}

// norm_item is destructured off deliberately: it's a search-side index
// projection, not part of a MenuItem, and every SELECT * here would
// otherwise carry a duplicate of every item name into memory -- including
// getAllMenuItems(), which holds all 46k rows for Ask Rumbly.
function rowToMenuItem({ norm_item: _normItem, ...row }: MenuItemRow): MenuItem {
  return {
    ...row,
    is_seasonal: !!row.is_seasonal,
    is_limited_time: !!row.is_limited_time,
    is_allergy_friendly: !!row.is_allergy_friendly,
    is_kids: !!row.is_kids,
    is_alcoholic: !!row.is_alcoholic,
    has_allergy_option: !!row.has_allergy_option,
    allergens: JSON.parse(row.allergens || '[]'),
    allergy_free_of: JSON.parse(row.allergy_free_of || '[]'),
    is_festival_item: !!row.is_festival_item,
    show_in_menu: !!row.show_in_menu,
    norm_categories: JSON.parse(row.norm_categories || '[]'),
    cuisine_tags: JSON.parse(row.cuisine_tags || '[]'),
  };
}

// Unused until Milestone 2's restaurant detail screen — the schema lands
// now so the storage design is proven end-to-end in Milestone 1.
export async function getMenuItemsByRestaurant(restaurantId: string): Promise<MenuItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MenuItemRow>(
    'SELECT * FROM menu_items WHERE restaurant_id = $restaurant_id;',
    { $restaurant_id: restaurantId }
  );
  return rows.map(rowToMenuItem);
}

// Ask Rumbly is intentionally lazy: normal app startup only needs the slim
// search index and restaurant records, while semantic menu questions need the
// full rows (including Disney's direct allergy labels) to prove an answer.
// Keep one in-memory promise for the Ask tab so a second question does not
// rescan SQLite. DataProvider clears this cache indirectly through
// clearMenuItems() before every import.
export function getAllMenuItems(): Promise<MenuItem[]> {
  if (!allMenuItemsPromise) {
    allMenuItemsPromise = getDb()
      .then((db) => db.getAllAsync<MenuItemRow>('SELECT * FROM menu_items ORDER BY id;'))
      .then((rows) => rows.map(rowToMenuItem))
      .catch((error) => {
        allMenuItemsPromise = null;
        throw error;
      });
  }
  return allMenuItemsPromise;
}

export async function countMenuItems(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM menu_items;');
  return row?.count ?? 0;
}

// Backs the "Check Out Exclusive Items" ticketed-event cards on Explore
// (see ticketedEvents.ts) -- a handful of category_group values out of
// 45k+ rows, so a plain IN () scan is fine without a dedicated index.
// dining_period is checked too, not just category_group, matching the
// combined signal that distinguishes real hard-ticket-event exclusives
// from the unrelated "exclusive" categories elsewhere in the data
// (Annual Passholder Exclusive, Dinner Exclusives, etc. -- all under
// normal dining periods, not Special Ticketed Event).
export async function getMenuItemsByCategoryGroups(categoryGroups: string[]): Promise<MenuItem[]> {
  if (categoryGroups.length === 0) return [];
  const db = await getDb();
  const params: Record<string, string> = {};
  const placeholders = categoryGroups
    .map((group, index) => {
      const key = `$cg${index}`;
      params[key] = group;
      return key;
    })
    .join(', ');
  const rows = await db.getAllAsync<MenuItemRow>(
    `SELECT * FROM menu_items WHERE category_group IN (${placeholders}) AND dining_period = 'Special Ticketed Event';`,
    params
  );
  return rows.map(rowToMenuItem);
}

export async function getGeneralSeasonalCollectionItems(
  categoryGroups: string[],
  excludedTicketedCategoryGroups: string[]
): Promise<MenuItem[]> {
  const query = buildGeneralSeasonalCollectionQuery(
    categoryGroups,
    excludedTicketedCategoryGroups
  );
  if (!query) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<MenuItemRow>(query.sql, query.params);
  return rows.map(rowToMenuItem);
}
