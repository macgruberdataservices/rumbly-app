import type { SqlDatabase } from './sqlDatabase.ts';

const ACTIVITY_SCHEMA_SQL = `
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
`;

export async function ensureActivitySchema(db: SqlDatabase): Promise<void> {
  await db.execAsync(ACTIVITY_SCHEMA_SQL);
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(activity);');
  if (!columns.some((column) => column.name === 'value')) {
    await db.execAsync('ALTER TABLE activity ADD COLUMN value REAL;');
  }
}

export interface GotItEventInsert {
  clientId: string;
  restaurantId: string;
  itemId: string | null;
  rating: number | null;
  occurredAt: string;
  createdAt: string;
}

interface ExistingGotItRow {
  target_type: string;
  restaurant_id: string;
  item_id: string | null;
  activity_type: string;
  deleted: number;
}

function validateRating(rating: number | null): void {
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error('Got It rating must be an integer from 1 through 5.');
  }
}

export async function ensureGotItEvent(
  db: SqlDatabase,
  event: GotItEventInsert
): Promise<'inserted' | 'existing'> {
  validateRating(event.rating);
  const existing = await db.getFirstAsync<ExistingGotItRow>(
    `SELECT target_type, restaurant_id, item_id, activity_type, deleted
     FROM activity WHERE client_id = $client_id;`,
    { $client_id: event.clientId }
  );

  if (existing) {
    const expectedTargetType = event.itemId === null ? 'restaurant' : 'item';
    const isSameEvent =
      existing.target_type === expectedTargetType
      && existing.restaurant_id === event.restaurantId
      && existing.item_id === event.itemId
      && existing.activity_type === 'got_it'
      && existing.deleted === 0;
    if (!isSameEvent) {
      throw new Error('The Journal client ID is already linked to different activity.');
    }
    return 'existing';
  }

  await db.runAsync(
    `INSERT INTO activity (
       client_id, target_type, restaurant_id, item_id, activity_type,
       occurred_at, created_at, updated_at, value, deleted
     ) VALUES (
       $client_id, $target_type, $restaurant_id, $item_id, 'got_it',
       $occurred_at, $created_at, $created_at, $rating, 0
     );`,
    {
      $client_id: event.clientId,
      $target_type: event.itemId === null ? 'restaurant' : 'item',
      $restaurant_id: event.restaurantId,
      $item_id: event.itemId,
      $occurred_at: event.occurredAt,
      $created_at: event.createdAt,
      $rating: event.rating,
    }
  );
  return 'inserted';
}
