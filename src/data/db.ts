// The only indexed/on-demand-queried store in the app. Mirrors the source
// PWA's IDB_STORE_ITEMS: full menu item records (45k+, 28 fields each),
// never held fully in memory, fetched only by restaurant_id when a
// specific restaurant's menu screen opens. Everything else (restaurants,
// hours, the search index) lives in fileStore.ts instead — see that file
// for why.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { MenuItem } from './types';
import { getDb as getSharedDb } from './sqlite';

let readyPromise: Promise<SQLiteDatabase> | null = null;

function getDb(): Promise<SQLiteDatabase> {
  if (!readyPromise) {
    readyPromise = getSharedDb().then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS menu_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          restaurant_id TEXT NOT NULL,
          item_id TEXT,
          item TEXT,
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
      `);
      return db;
    });
  }
  return readyPromise;
}

const bool = (v: boolean): number => (v ? 1 : 0);
const json = (v: unknown): string => JSON.stringify(v ?? []);

export async function clearMenuItems(): Promise<void> {
  const db = await getDb();
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
        restaurant_id, item_id, item, description, category, category_group,
        group_display_order, dining_period, price_display, price_value,
        price_changed, previous_price, is_seasonal, is_limited_time,
        is_allergy_friendly, is_kids, is_alcoholic, has_allergy_option,
        is_festival_item, show_in_menu, norm_categories, cuisine_tags,
        festival_name, festival_year, first_seen, last_seen,
        queried_facility_id, fetched_from_facility_id
      ) VALUES (
        $restaurant_id, $item_id, $item, $description, $category, $category_group,
        $group_display_order, $dining_period, $price_display, $price_value,
        $price_changed, $previous_price, $is_seasonal, $is_limited_time,
        $is_allergy_friendly, $is_kids, $is_alcoholic, $has_allergy_option,
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

function rowToMenuItem(row: MenuItemRow): MenuItem {
  return {
    ...row,
    is_seasonal: !!row.is_seasonal,
    is_limited_time: !!row.is_limited_time,
    is_allergy_friendly: !!row.is_allergy_friendly,
    is_kids: !!row.is_kids,
    is_alcoholic: !!row.is_alcoholic,
    has_allergy_option: !!row.has_allergy_option,
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

export async function countMenuItems(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM menu_items;');
  return row?.count ?? 0;
}
