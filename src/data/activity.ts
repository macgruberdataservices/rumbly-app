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

export async function toggleFavorite(restaurantId: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number; deleted: number }>(
    `SELECT id, deleted FROM activity
     WHERE restaurant_id = $restaurant_id AND activity_type = 'favorited'
     ORDER BY id DESC LIMIT 1;`,
    { $restaurant_id: restaurantId }
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
     VALUES ($client_id, 'restaurant', $restaurant_id, NULL, 'favorited', $now, $now, $now, 0);`,
    { $client_id: generateClientId(), $restaurant_id: restaurantId, $now: now }
  );
  return true;
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

export async function loadFavoritedIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ restaurant_id: string }>(
    "SELECT DISTINCT restaurant_id FROM activity WHERE activity_type = 'favorited' AND deleted = 0;"
  );
  return new Set(rows.map((r) => r.restaurant_id));
}

export async function loadCheckedInIds(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ restaurant_id: string }>(
    "SELECT DISTINCT restaurant_id FROM activity WHERE activity_type = 'checked_in' AND deleted = 0;"
  );
  return new Set(rows.map((r) => r.restaurant_id));
}
