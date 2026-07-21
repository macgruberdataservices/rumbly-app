// Local-first activity store. Event log, not
// boolean columns — a row per action, soft-deletable, so history (e.g.
// repeat Got It events) survives and sync can merge by
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
          value REAL,
          deleted INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_activity_restaurant ON activity(restaurant_id);

        UPDATE activity SET activity_type = 'love_it'
          WHERE activity_type = 'favorited';
        UPDATE activity SET activity_type = 'need_it'
          WHERE activity_type = 'want_to_try';
        UPDATE activity SET activity_type = 'got_it'
          WHERE activity_type = 'checked_in';
      `);
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(activity);');
      if (!columns.some((column) => column.name === 'value')) {
        await db.execAsync('ALTER TABLE activity ADD COLUMN value REAL;');
      }
      return db;
    });
  }
  return readyPromise;
}

function generateClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// itemId null = a restaurant-level activity (e.g. the header's Love
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

export function toggleLove(restaurantId: string): Promise<boolean> {
  return toggleActivity(restaurantId, 'love_it', null);
}

export function toggleItemLove(restaurantId: string, itemId: string): Promise<boolean> {
  return toggleActivity(restaurantId, 'love_it', itemId);
}

export function toggleItemNeedIt(restaurantId: string, itemId: string): Promise<boolean> {
  return toggleActivity(restaurantId, 'need_it', itemId);
}

async function addGotIt(restaurantId: string, itemId: string | null): Promise<string> {
  const db = await getDb();
  const now = new Date().toISOString();
  const clientId = generateClientId();
  await db.runAsync(
    `INSERT INTO activity (client_id, target_type, restaurant_id, item_id, activity_type, occurred_at, created_at, updated_at, deleted)
     VALUES ($client_id, $target_type, $restaurant_id, $item_id, 'got_it', $now, $now, $now, 0);`,
    {
      $client_id: clientId,
      $target_type: itemId ? 'item' : 'restaurant',
      $restaurant_id: restaurantId,
      $item_id: itemId,
      $now: now,
    }
  );
  return clientId;
}

export function addRestaurantGotIt(restaurantId: string): Promise<string> {
  return addGotIt(restaurantId, null);
}

export function addItemGotIt(restaurantId: string, itemId: string): Promise<string> {
  return addGotIt(restaurantId, itemId);
}

export async function setGotItRating(clientId: string, rating: number): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE activity SET value = $rating, updated_at = $now
     WHERE client_id = $client_id AND activity_type = 'got_it' AND deleted = 0;`,
    { $rating: rating, $now: now, $client_id: clientId }
  );
}

export async function undoGotIt(clientId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE activity SET deleted = 1, updated_at = $now
     WHERE client_id = $client_id AND activity_type = 'got_it' AND deleted = 0;`,
    { $now: now, $client_id: clientId }
  );
}

// Restaurant-level only (item_id IS NULL) -- an item-level Love must
// not make its parent restaurant look Loved too, those are
// independent activities.
export async function loadLovedIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ restaurant_id: string }>(
    "SELECT DISTINCT restaurant_id FROM activity WHERE activity_type = 'love_it' AND item_id IS NULL AND deleted = 0;"
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

export function loadLovedItemKeys(): Promise<Set<string>> {
  return loadItemActivityKeys('love_it');
}

export function loadNeedItItemKeys(): Promise<Set<string>> {
  return loadItemActivityKeys('need_it');
}

export async function loadGotItItemCounts(): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ restaurant_id: string; item_id: string; count: number }>(
    `SELECT restaurant_id, item_id, COUNT(*) AS count FROM activity
     WHERE activity_type = 'got_it' AND item_id IS NOT NULL AND deleted = 0
     GROUP BY restaurant_id, item_id;`
  );
  return new Map(rows.map((r) => [`${r.restaurant_id}:${r.item_id}`, r.count]));
}

export async function loadGotItRestaurantCounts(): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ restaurant_id: string; count: number }>(
    `SELECT restaurant_id, COUNT(*) AS count FROM activity
     WHERE activity_type = 'got_it' AND item_id IS NULL AND deleted = 0
     GROUP BY restaurant_id;`
  );
  return new Map(rows.map((r) => [r.restaurant_id, r.count]));
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
  value: number | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

function normalizeActivityType(activityType: string): string {
  if (activityType === 'favorited') return 'love_it';
  if (activityType === 'want_to_try') return 'need_it';
  if (activityType === 'checked_in') return 'got_it';
  return activityType;
}

export async function getAllActivityRows(): Promise<ActivityRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    client_id: string;
    target_type: string;
    restaurant_id: string;
    item_id: string | null;
    activity_type: string;
    value: number | null;
    occurred_at: string;
    created_at: string;
    updated_at: string;
    deleted: number;
  }>('SELECT client_id, target_type, restaurant_id, item_id, activity_type, value, occurred_at, created_at, updated_at, deleted FROM activity;');
  return rows.map((r) => ({ ...r, deleted: r.deleted === 1 }));
}

// Inserts a row that only exists remotely, or overwrites a local row that
// lost a last-write-wins comparison in sync.ts -- the caller has already
// decided the remote copy should win, this just applies it.
export async function applyRemoteRow(row: ActivityRow): Promise<void> {
  const db = await getDb();
  const activityType = normalizeActivityType(row.activity_type);
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM activity WHERE client_id = $client_id;',
    { $client_id: row.client_id }
  );
  const deletedValue = row.deleted ? 1 : 0;

  if (existing) {
    await db.runAsync(
      `UPDATE activity SET target_type = $target_type, restaurant_id = $restaurant_id, item_id = $item_id,
       activity_type = $activity_type, value = $value, occurred_at = $occurred_at, created_at = $created_at,
       updated_at = $updated_at, deleted = $deleted WHERE id = $id;`,
      {
        $target_type: row.target_type,
        $restaurant_id: row.restaurant_id,
        $item_id: row.item_id,
        $activity_type: activityType,
        $value: row.value,
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
    `INSERT INTO activity (client_id, target_type, restaurant_id, item_id, activity_type, value, occurred_at, created_at, updated_at, deleted)
     VALUES ($client_id, $target_type, $restaurant_id, $item_id, $activity_type, $value, $occurred_at, $created_at, $updated_at, $deleted);`,
    {
      $client_id: row.client_id,
      $target_type: row.target_type,
      $restaurant_id: row.restaurant_id,
      $item_id: row.item_id,
      $activity_type: activityType,
      $value: row.value,
      $occurred_at: row.occurred_at,
      $created_at: row.created_at,
      $updated_at: row.updated_at,
      $deleted: deletedValue,
    }
  );
}
