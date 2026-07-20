// Local-only activity store (favorites, check-ins). Event log, not
// boolean columns — a row per action, soft-deletable, so history (e.g.
// repeat check-ins) survives and any future sync phase can merge by
// client_id rather than overwriting a whole record.

import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb as getSharedDb } from './sqlite';

let readyPromise: Promise<SQLiteDatabase> | null = null;

function getDb(): Promise<SQLiteDatabase> {
  if (!readyPromise) {
    readyPromise = getSharedDb().then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS activity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id TEXT NOT NULL UNIQUE,
          target_type TEXT NOT NULL,
          restaurant_id TEXT NOT NULL,
          item_id TEXT,
          activity_type TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_activity_restaurant ON activity(restaurant_id);
      `);
      return db;
    });
  }
  return readyPromise;
}

function generateClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// itemId null = a restaurant-level activity (e.g. the header's Favorite
// button); itemId set = an item-level activity (e.g. a menu row's swipe
// action). COALESCE-to-empty-string sidesteps SQLite's NULL != NULL so one
// query handles both cases instead of two branches.
async function toggleActivity(
  restaurantId: string,
  activityType: string,
  itemId: string | null
): Promise<boolean> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number; deleted: number }>(
    `SELECT id, deleted FROM activity
     WHERE restaurant_id = $restaurant_id AND activity_type = $activity_type
       AND COALESCE(item_id, '') = COALESCE($item_id, '')
     ORDER BY id DESC LIMIT 1;`,
    { $restaurant_id: restaurantId, $activity_type: activityType, $item_id: itemId }
  );
  const now = new Date().toISOString();

  if (existing && existing.deleted === 0) {
    await db.runAsync('UPDATE activity SET deleted = 1, updated_at = $now WHERE id = $id;', {
      $now: now,
      $id: existing.id,
    });
    return false;
  }
  if (existing) {
    await db.runAsync('UPDATE activity SET deleted = 0, updated_at = $now WHERE id = $id;', {
      $now: now,
      $id: existing.id,
    });
    return true;
  }
  await db.runAsync(
    `INSERT INTO activity (client_id, target_type, restaurant_id, item_id, activity_type, occurred_at, created_at, updated_at, deleted)
     VALUES ($client_id, $target_type, $restaurant_id, $item_id, $activity_type, $now, $now, $now, 0);`,
    {
      $client_id: generateClientId(),
      $target_type: itemId ? 'item' : 'restaurant',
      $restaurant_id: restaurantId,
      $item_id: itemId,
      $activity_type: activityType,
      $now: now,
    }
  );
  return true;
}

export function toggleFavorite(restaurantId: string): Promise<boolean> {
  return toggleActivity(restaurantId, 'favorited', null);
}

export function toggleItemFavorite(restaurantId: string, itemId: string): Promise<boolean> {
  return toggleActivity(restaurantId, 'favorited', itemId);
}

export function toggleItemWantToTry(restaurantId: string, itemId: string): Promise<boolean> {
  return toggleActivity(restaurantId, 'want_to_try', itemId);
}

export async function addCheckIn(restaurantId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO activity (client_id, target_type, restaurant_id, item_id, activity_type, occurred_at, created_at, updated_at, deleted)
     VALUES ($client_id, 'restaurant', $restaurant_id, NULL, 'checked_in', $now, $now, $now, 0);`,
    { $client_id: generateClientId(), $restaurant_id: restaurantId, $now: now }
  );
}

// Restaurant-level only (item_id IS NULL) -- an item-level favorite must
// not make its parent restaurant look favorited too, those are
// independent activities.
export async function loadFavoritedIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ restaurant_id: string }>(
    "SELECT DISTINCT restaurant_id FROM activity WHERE activity_type = 'favorited' AND item_id IS NULL AND deleted = 0;"
  );
  return new Set(rows.map((r) => r.restaurant_id));
}

// Keyed by `${restaurant_id}:${item_id}`, not item_id alone -- item_id
// isn't guaranteed unique across different restaurants.
async function loadItemActivityKeys(activityType: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ restaurant_id: string; item_id: string }>(
    `SELECT DISTINCT restaurant_id, item_id FROM activity
     WHERE activity_type = $activity_type AND item_id IS NOT NULL AND deleted = 0;`,
    { $activity_type: activityType }
  );
  return new Set(rows.map((r) => `${r.restaurant_id}:${r.item_id}`));
}

export function loadFavoritedItemKeys(): Promise<Set<string>> {
  return loadItemActivityKeys('favorited');
}

export function loadWantToTriedItemKeys(): Promise<Set<string>> {
  return loadItemActivityKeys('want_to_try');
}

export async function loadCheckedInIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ restaurant_id: string }>(
    "SELECT DISTINCT restaurant_id FROM activity WHERE activity_type = 'checked_in' AND deleted = 0;"
  );
  return new Set(rows.map((r) => r.restaurant_id));
}

// --- Milestone 12: sync support. Row shape mirrors the Supabase `activity`
// table (minus id/user_id, which are remote-only) so sync.ts can diff the
// two sides directly by client_id.

export interface ActivityRow {
  client_id: string;
  target_type: string;
  restaurant_id: string;
  item_id: string | null;
  activity_type: string;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export async function getAllActivityRows(): Promise<ActivityRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    client_id: string;
    target_type: string;
    restaurant_id: string;
    item_id: string | null;
    activity_type: string;
    occurred_at: string;
    created_at: string;
    updated_at: string;
    deleted: number;
  }>('SELECT client_id, target_type, restaurant_id, item_id, activity_type, occurred_at, created_at, updated_at, deleted FROM activity;');
  return rows.map((r) => ({ ...r, deleted: r.deleted === 1 }));
}

// Inserts a row that only exists remotely, or overwrites a local row that
// lost a last-write-wins comparison in sync.ts -- the caller has already
// decided the remote copy should win, this just applies it.
export async function applyRemoteRow(row: ActivityRow): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM activity WHERE client_id = $client_id;',
    { $client_id: row.client_id }
  );
  const deletedValue = row.deleted ? 1 : 0;

  if (existing) {
    await db.runAsync(
      `UPDATE activity SET target_type = $target_type, restaurant_id = $restaurant_id, item_id = $item_id,
       activity_type = $activity_type, occurred_at = $occurred_at, created_at = $created_at,
       updated_at = $updated_at, deleted = $deleted WHERE id = $id;`,
      {
        $target_type: row.target_type,
        $restaurant_id: row.restaurant_id,
        $item_id: row.item_id,
        $activity_type: row.activity_type,
        $occurred_at: row.occurred_at,
        $created_at: row.created_at,
        $updated_at: row.updated_at,
        $deleted: deletedValue,
        $id: existing.id,
      }
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO activity (client_id, target_type, restaurant_id, item_id, activity_type, occurred_at, created_at, updated_at, deleted)
     VALUES ($client_id, $target_type, $restaurant_id, $item_id, $activity_type, $occurred_at, $created_at, $updated_at, $deleted);`,
    {
      $client_id: row.client_id,
      $target_type: row.target_type,
      $restaurant_id: row.restaurant_id,
      $item_id: row.item_id,
      $activity_type: row.activity_type,
      $occurred_at: row.occurred_at,
      $created_at: row.created_at,
      $updated_at: row.updated_at,
      $deleted: deletedValue,
    }
  );
}
