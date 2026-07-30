import type { SqlDatabase } from './sqlDatabase.ts';

export const JOURNAL_LOCAL_SCHEMA_VERSION = 2;

export const JOURNAL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS journal_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    restaurant_id TEXT NOT NULL,
    item_id TEXT,
    restaurant_name_snapshot TEXT NOT NULL,
    item_name_snapshot TEXT,
    visited_on TEXT NOT NULL,
    meal_period_snapshot TEXT,
    note TEXT,
    sync_state TEXT NOT NULL DEFAULT 'pending_entry'
      CHECK (sync_state IN ('draft', 'pending_entry', 'pending_photos', 'synced', 'failed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE (user_id, client_id),
    UNIQUE (id, user_id),
    CHECK (
      (item_id IS NULL AND item_name_snapshot IS NULL)
      OR (item_id IS NOT NULL AND item_name_snapshot IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date
    ON journal_entries(user_id, visited_on DESC);
  CREATE INDEX IF NOT EXISTS idx_journal_entries_user_item
    ON journal_entries(user_id, restaurant_id, item_id, visited_on DESC);

  CREATE TABLE IF NOT EXISTS journal_photos (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    local_uri TEXT,
    local_thumbnail_uri TEXT,
    display_path TEXT,
    thumbnail_path TEXT,
    position INTEGER NOT NULL CHECK (position >= 0 AND position < 6),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    display_bytes INTEGER CHECK (display_bytes IS NULL OR display_bytes >= 0),
    thumbnail_bytes INTEGER CHECK (thumbnail_bytes IS NULL OR thumbnail_bytes >= 0),
    sync_state TEXT NOT NULL DEFAULT 'staged'
      CHECK (sync_state IN ('staged', 'pending', 'synced', 'failed')),
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (entry_id, user_id)
      REFERENCES journal_entries(id, user_id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_journal_photos_user_entry
    ON journal_photos(user_id, entry_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_photos_active_position
    ON journal_photos(entry_id, position)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS journal_staged_photos (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0 AND position < 6),
    display_uri TEXT NOT NULL,
    thumbnail_uri TEXT NOT NULL,
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    display_bytes INTEGER NOT NULL CHECK (display_bytes >= 0),
    thumbnail_bytes INTEGER NOT NULL CHECK (thumbnail_bytes >= 0),
    created_at TEXT NOT NULL,
    UNIQUE (draft_id, position)
  );

  CREATE INDEX IF NOT EXISTS idx_journal_staged_photos_user_draft
    ON journal_staged_photos(user_id, draft_id, position);

  CREATE TABLE IF NOT EXISTS journal_drafts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    restaurant_id TEXT NOT NULL,
    item_id TEXT,
    restaurant_name_snapshot TEXT NOT NULL,
    item_name_snapshot TEXT,
    visited_on TEXT NOT NULL,
    meal_period_snapshot TEXT,
    note TEXT,
    rating REAL CHECK (
      rating IS NULL OR (
        rating >= 1 AND rating <= 5 AND CAST(rating AS INTEGER) = rating
      )
    ),
    photo_ids_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, client_id),
    CHECK (
      (item_id IS NULL AND item_name_snapshot IS NULL)
      OR (item_id IS NOT NULL AND item_name_snapshot IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_journal_drafts_user_updated
    ON journal_drafts(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS journal_outbox (
    operation_key TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('entry', 'photo')),
    entity_id TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK (
      operation_type IN ('entry_upsert', 'entry_delete', 'photo_upsert', 'photo_delete')
    ),
    state TEXT NOT NULL DEFAULT 'pending'
      CHECK (state IN ('pending', 'processing', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_journal_outbox_user_state
    ON journal_outbox(user_id, state, created_at);
`;

export async function ensureJournalSchema(db: SqlDatabase): Promise<void> {
  await db.execAsync(JOURNAL_SCHEMA_SQL);
  await db.runAsync(
    `INSERT INTO journal_metadata (key, value)
     VALUES ('schema_version', $version)
     ON CONFLICT(key) DO NOTHING;`,
    { $version: String(JOURNAL_LOCAL_SCHEMA_VERSION) }
  );
  const stored = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM journal_metadata WHERE key = 'schema_version';"
  );
  const storedVersion = Number(stored?.value);
  if (!Number.isInteger(storedVersion) || storedVersion < 1) {
    throw new Error('Journal local schema version is invalid.');
  }
  if (storedVersion > JOURNAL_LOCAL_SCHEMA_VERSION) {
    throw new Error(
      `Journal local schema ${storedVersion} is newer than supported version ${JOURNAL_LOCAL_SCHEMA_VERSION}.`
    );
  }
  if (storedVersion < 2) {
    await db.execAsync(`
      ALTER TABLE journal_photos ADD COLUMN local_thumbnail_uri TEXT;
      CREATE TABLE IF NOT EXISTS journal_staged_photos (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 0 AND position < 6),
        display_uri TEXT NOT NULL,
        thumbnail_uri TEXT NOT NULL,
        width INTEGER NOT NULL CHECK (width > 0),
        height INTEGER NOT NULL CHECK (height > 0),
        display_bytes INTEGER NOT NULL CHECK (display_bytes >= 0),
        thumbnail_bytes INTEGER NOT NULL CHECK (thumbnail_bytes >= 0),
        created_at TEXT NOT NULL,
        UNIQUE (draft_id, position)
      );
      CREATE INDEX IF NOT EXISTS idx_journal_staged_photos_user_draft
        ON journal_staged_photos(user_id, draft_id, position);
    `);
    await db.runAsync(
      "UPDATE journal_metadata SET value = '2' WHERE key = 'schema_version';"
    );
  }
}
