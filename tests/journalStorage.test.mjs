import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ensureActivitySchema } from '../src/data/activitySql.ts';
import {
  createJournalEntryRecord,
  deleteJournalEntryRecord,
  failJournalOutboxOperationRecord,
  getJournalDraftRecord,
  getLatestJournalDraftRecord,
  getJournalEntryRecord,
  getJournalPhotoRecord,
  listJournalEntryRecords,
  listJournalOutboxRecords,
  listJournalPhotoIdsForEntry,
  listJournalPhotoRecords,
  listStagedJournalPhotoRecords,
  markJournalPhotoOrphanedRecord,
  markJournalPhotoSyncedRecord,
  removeJournalOutboxOperationRecord,
  saveJournalDraftRecord,
  saveStagedJournalPhotoRecord,
  setJournalEntrySyncStateRecord,
  updateJournalEntryRecord,
} from '../src/data/journalRepository.ts';
import { ensureJournalSchema } from '../src/data/journalSchema.ts';

class AsyncNodeSqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec('PRAGMA foreign_keys = ON;');
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

  async withExclusiveTransactionAsync(task) {
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      await task(this);
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

async function makeDatabase(t) {
  const db = new AsyncNodeSqlite();
  t.after(() => db.close());
  await ensureActivitySchema(db);
  await ensureJournalSchema(db);
  return db;
}

function entryInput(overrides = {}) {
  return {
    id: 'entry-1',
    userId: 'user-1',
    clientId: 'client-1',
    restaurantId: 'restaurant-a',
    itemId: 'item-1',
    restaurantNameSnapshot: 'Restaurant A',
    itemNameSnapshot: 'Grilled Chicken',
    visitedOn: '2026-07-29',
    mealPeriodSnapshot: 'Lunch',
    note: 'Excellent',
    rating: 5,
    photoIds: [],
    ...overrides,
  };
}

const CREATED_AT = '2026-07-29T16:00:00.000Z';

async function createInTransaction(db, input, now = CREATED_AT) {
  let result;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    result = await createJournalEntryRecord(transaction, input, now);
  });
  return result;
}

test('Journal schema creates versioned entry, photo, draft, and outbox tables', async (t) => {
  const db = await makeDatabase(t);
  const tables = await db.getAllAsync(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name LIKE 'journal_%'
     ORDER BY name;`
  );
  assert.deepEqual(
    tables.map((row) => row.name),
    [
      'journal_drafts',
      'journal_entries',
      'journal_metadata',
      'journal_outbox',
      'journal_photos',
      'journal_staged_photos',
    ]
  );
  const version = await db.getFirstAsync(
    "SELECT value FROM journal_metadata WHERE key = 'schema_version';"
  );
  assert.equal(version.value, '2');
});

test('Journal schema migrates existing photo metadata from version 1', async (t) => {
  const db = new AsyncNodeSqlite();
  t.after(() => db.close());
  await db.execAsync(`
    CREATE TABLE journal_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    INSERT INTO journal_metadata (key, value) VALUES ('schema_version', '1');
    CREATE TABLE journal_photos (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      local_uri TEXT,
      display_path TEXT,
      thumbnail_path TEXT,
      position INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      display_bytes INTEGER,
      thumbnail_bytes INTEGER,
      sync_state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);

  await ensureJournalSchema(db);

  const columns = await db.getAllAsync('PRAGMA table_info(journal_photos);');
  assert.equal(columns.some((column) => column.name === 'local_thumbnail_uri'), true);
  const version = await db.getFirstAsync(
    "SELECT value FROM journal_metadata WHERE key = 'schema_version';"
  );
  assert.equal(version.value, '2');
});

test('creating an entry atomically links one Got It event and one outbox operation', async (t) => {
  const db = await makeDatabase(t);
  const result = await createInTransaction(db, entryInput());

  assert.equal(result.created, true);
  assert.equal(result.entry.clientId, 'client-1');
  const activity = await db.getFirstAsync(
    `SELECT client_id, restaurant_id, item_id, activity_type, occurred_at, value, deleted
     FROM activity WHERE client_id = 'client-1';`
  );
  assert.deepEqual(
    { ...activity },
    {
      client_id: 'client-1',
      restaurant_id: 'restaurant-a',
      item_id: 'item-1',
      activity_type: 'got_it',
      occurred_at: '2026-07-29T12:00:00.000Z',
      value: 5,
      deleted: 0,
    }
  );
  const outbox = await listJournalOutboxRecords(db, 'user-1');
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].operationType, 'entry_upsert');
});

test('retrying the same create is idempotent and does not duplicate Journal or Got It rows', async (t) => {
  const db = await makeDatabase(t);
  await createInTransaction(db, entryInput());
  const retry = await createInTransaction(
    db,
    entryInput(),
    '2026-07-29T16:01:00.000Z'
  );

  assert.equal(retry.created, false);
  const entryCount = await db.getFirstAsync('SELECT COUNT(*) AS count FROM journal_entries;');
  const activityCount = await db.getFirstAsync(
    "SELECT COUNT(*) AS count FROM activity WHERE activity_type = 'got_it';"
  );
  const outboxCount = await db.getFirstAsync('SELECT COUNT(*) AS count FROM journal_outbox;');
  assert.equal(entryCount.count, 1);
  assert.equal(activityCount.count, 1);
  assert.equal(outboxCount.count, 1);
});

test('retrying a saved entry removes a draft recreated by a late autosave', async (t) => {
  const db = await makeDatabase(t);
  const input = entryInput();
  await createInTransaction(db, input);
  await saveJournalDraftRecord(db, {
    id: input.id,
    userId: input.userId,
    clientId: input.clientId,
    restaurantId: input.restaurantId,
    itemId: input.itemId,
    restaurantNameSnapshot: input.restaurantNameSnapshot,
    itemNameSnapshot: input.itemNameSnapshot,
    visitedOn: input.visitedOn,
    mealPeriodSnapshot: input.mealPeriodSnapshot,
    note: 'Late draft',
    rating: input.rating,
    photoIds: [],
    updatedAt: '2026-07-29T16:00:30.000Z',
  });

  assert.notEqual(await getJournalDraftRecord(db, input.userId, input.id), null);
  const retry = await createInTransaction(
    db,
    input,
    '2026-07-29T16:01:00.000Z'
  );

  assert.equal(retry.created, false);
  assert.equal(await getJournalDraftRecord(db, input.userId, input.id), null);
});

test('reusing a client ID for another target fails without partial writes', async (t) => {
  const db = await makeDatabase(t);
  await createInTransaction(db, entryInput());

  await assert.rejects(
    createInTransaction(db, entryInput({
      id: 'entry-2',
      restaurantId: 'restaurant-b',
      restaurantNameSnapshot: 'Restaurant B',
    })),
    /already in use|different activity/
  );
  const entryCount = await db.getFirstAsync('SELECT COUNT(*) AS count FROM journal_entries;');
  const activityCount = await db.getFirstAsync(
    "SELECT COUNT(*) AS count FROM activity WHERE activity_type = 'got_it';"
  );
  assert.equal(entryCount.count, 1);
  assert.equal(activityCount.count, 1);
});

test('item history spans meal periods at one restaurant but not another restaurant', async (t) => {
  const db = await makeDatabase(t);
  await createInTransaction(db, entryInput());
  await createInTransaction(db, entryInput({
    id: 'entry-2',
    clientId: 'client-2',
    visitedOn: '2026-07-30',
    mealPeriodSnapshot: 'Dinner',
  }));
  await createInTransaction(db, entryInput({
    id: 'entry-3',
    clientId: 'client-3',
    restaurantId: 'restaurant-b',
    restaurantNameSnapshot: 'Restaurant B',
  }));

  const history = await listJournalEntryRecords(db, {
    userId: 'user-1',
    restaurantId: 'restaurant-a',
    itemId: 'item-1',
    startDate: null,
    endDate: null,
  });
  assert.deepEqual(history.map((entry) => entry.id), ['entry-2', 'entry-1']);
  assert.deepEqual(
    history.map((entry) => entry.mealPeriodSnapshot),
    ['Dinner', 'Lunch']
  );
});

test('editing an entry updates local details, linked rating, and pending outbox state', async (t) => {
  const db = await makeDatabase(t);
  await createInTransaction(db, entryInput());
  let updated;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    updated = await updateJournalEntryRecord(
      transaction,
      {
        id: 'entry-1',
        userId: 'user-1',
        visitedOn: '2026-07-30',
        mealPeriodSnapshot: 'Dinner',
        note: 'Even better the second time',
        rating: 4,
        photoIds: [],
      },
      '2026-07-30T16:00:00.000Z'
    );
  });

  assert.equal(updated.visitedOn, '2026-07-30');
  assert.equal(updated.mealPeriodSnapshot, 'Dinner');
  assert.equal(updated.note, 'Even better the second time');
  const activity = await db.getFirstAsync(
    "SELECT value, occurred_at FROM activity WHERE client_id = 'client-1';"
  );
  assert.equal(activity.value, 4);
  assert.equal(activity.occurred_at, '2026-07-30T12:00:00.000Z');
  const outbox = await listJournalOutboxRecords(db, 'user-1');
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].operationType, 'entry_upsert');
});

test('Journal-only deletion preserves Got It while combined deletion removes it', async (t) => {
  const db = await makeDatabase(t);
  await createInTransaction(db, entryInput());
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await deleteJournalEntryRecord(
      transaction,
      'user-1',
      'entry-1',
      'journal_only',
      '2026-07-30T16:00:00.000Z'
    );
  });
  assert.equal(await getJournalEntryRecord(db, 'user-1', 'entry-1'), null);
  const preserved = await db.getFirstAsync(
    "SELECT deleted FROM activity WHERE client_id = 'client-1';"
  );
  assert.equal(preserved.deleted, 0);

  await createInTransaction(db, entryInput({
    id: 'entry-2',
    clientId: 'client-2',
  }));
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await deleteJournalEntryRecord(
      transaction,
      'user-1',
      'entry-2',
      'journal_and_got_it',
      '2026-07-30T16:01:00.000Z'
    );
  });
  const removed = await db.getFirstAsync(
    "SELECT deleted FROM activity WHERE client_id = 'client-2';"
  );
  assert.equal(removed.deleted, 1);
  const outbox = await listJournalOutboxRecords(db, 'user-1');
  assert.equal(
    outbox.find((operation) => operation.entityId === 'entry-2').operationType,
    'entry_delete'
  );
});

test('drafts round-trip photo IDs and are removed by successful entry creation', async (t) => {
  const db = await makeDatabase(t);
  const draft = {
    id: 'entry-1',
    userId: 'user-1',
    clientId: 'client-1',
    restaurantId: 'restaurant-a',
    itemId: 'item-1',
    restaurantNameSnapshot: 'Restaurant A',
    itemNameSnapshot: 'Grilled Chicken',
    visitedOn: '2026-07-29',
    mealPeriodSnapshot: 'Lunch',
    note: 'Draft note',
    rating: 5,
    photoIds: ['photo-1', 'photo-2'],
    updatedAt: CREATED_AT,
  };
  await saveJournalDraftRecord(db, draft);
  assert.deepEqual(await getJournalDraftRecord(db, 'user-1', 'entry-1'), draft);

  await createInTransaction(db, entryInput());
  assert.equal(await getJournalDraftRecord(db, 'user-1', 'entry-1'), null);
});

test('successful entry creation promotes staged variants and queues photo upload', async (t) => {
  const db = await makeDatabase(t);
  await saveStagedJournalPhotoRecord(db, {
    id: 'photo-1',
    userId: 'user-1',
    draftId: 'entry-1',
    position: 0,
    displayUri: 'file:///pending/display.jpg',
    thumbnailUri: 'file:///pending/thumbnail.jpg',
    width: 1200,
    height: 900,
    displayBytes: 450000,
    thumbnailBytes: 24000,
    createdAt: CREATED_AT,
  });

  await createInTransaction(db, entryInput({ photoIds: ['photo-1'] }));

  assert.deepEqual(await listStagedJournalPhotoRecords(db, 'user-1', 'entry-1'), []);
  const photo = await db.getFirstAsync(
    `SELECT entry_id, local_uri, local_thumbnail_uri, position, sync_state
     FROM journal_photos WHERE id = 'photo-1';`
  );
  assert.deepEqual(
    { ...photo },
    {
      entry_id: 'entry-1',
      local_uri: 'file:///pending/display.jpg',
      local_thumbnail_uri: 'file:///pending/thumbnail.jpg',
      position: 0,
      sync_state: 'staged',
    }
  );
  const entry = await getJournalEntryRecord(db, 'user-1', 'entry-1');
  assert.equal(entry.syncState, 'pending_photos');
  const listedPhotos = await listJournalPhotoRecords(db, 'user-1', 'entry-1');
  assert.equal(listedPhotos[0].localThumbnailUri, 'file:///pending/thumbnail.jpg');
  const outbox = await listJournalOutboxRecords(db, 'user-1');
  assert.deepEqual(
    outbox.map((operation) => operation.operationKey).sort(),
    ['entry:entry-1', 'photo:photo-1']
  );
});

test('editing an entry can retain, add, and remove photos atomically', async (t) => {
  const db = await makeDatabase(t);
  await saveStagedJournalPhotoRecord(db, {
    id: 'photo-1',
    userId: 'user-1',
    draftId: 'entry-1',
    position: 0,
    displayUri: 'file:///pending/one-display.jpg',
    thumbnailUri: 'file:///pending/one-thumbnail.jpg',
    width: 1200,
    height: 900,
    displayBytes: 450000,
    thumbnailBytes: 24000,
    createdAt: CREATED_AT,
  });
  await createInTransaction(db, entryInput({ photoIds: ['photo-1'] }));
  await saveStagedJournalPhotoRecord(db, {
    id: 'photo-2',
    userId: 'user-1',
    draftId: 'entry-1',
    position: 0,
    displayUri: 'file:///pending/two-display.jpg',
    thumbnailUri: 'file:///pending/two-thumbnail.jpg',
    width: 900,
    height: 1200,
    displayBytes: 420000,
    thumbnailBytes: 22000,
    createdAt: '2026-07-30T16:00:00.000Z',
  });

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await updateJournalEntryRecord(
      transaction,
      {
        id: 'entry-1',
        userId: 'user-1',
        visitedOn: '2026-07-29',
        mealPeriodSnapshot: 'Lunch',
        note: 'Photo changed',
        rating: 5,
        photoIds: ['photo-2'],
      },
      '2026-07-30T16:01:00.000Z'
    );
  });

  const activePhotos = await listJournalPhotoRecords(db, 'user-1', 'entry-1');
  assert.deepEqual(activePhotos.map((photo) => photo.id), ['photo-2']);
  assert.equal(activePhotos[0].position, 0);
  const removed = await db.getFirstAsync(
    "SELECT deleted_at, sync_state FROM journal_photos WHERE id = 'photo-1';"
  );
  assert.equal(removed.deleted_at, '2026-07-30T16:01:00.000Z');
  assert.equal(removed.sync_state, 'pending');
  assert.deepEqual(await listStagedJournalPhotoRecords(db, 'user-1', 'entry-1'), []);
});

test('the newest draft can be resumed for its owner', async (t) => {
  const db = await makeDatabase(t);
  const draft = {
    id: 'older-draft',
    userId: 'user-1',
    clientId: 'older-client',
    restaurantId: 'restaurant-a',
    itemId: null,
    restaurantNameSnapshot: 'Restaurant A',
    itemNameSnapshot: null,
    visitedOn: '2026-07-28',
    mealPeriodSnapshot: null,
    note: null,
    rating: null,
    photoIds: [],
    updatedAt: '2026-07-28T10:00:00.000Z',
  };
  await saveJournalDraftRecord(db, draft);
  await saveJournalDraftRecord(db, {
    ...draft,
    id: 'newer-draft',
    clientId: 'newer-client',
    updatedAt: '2026-07-29T10:00:00.000Z',
  });

  assert.equal((await getLatestJournalDraftRecord(db, 'user-1'))?.id, 'newer-draft');
  assert.equal(await getLatestJournalDraftRecord(db, 'another-user'), null);
});

test('a draft ID cannot be overwritten by another user', async (t) => {
  const db = await makeDatabase(t);
  const draft = {
    id: 'entry-1',
    userId: 'user-1',
    clientId: 'client-1',
    restaurantId: 'restaurant-a',
    itemId: null,
    restaurantNameSnapshot: 'Restaurant A',
    itemNameSnapshot: null,
    visitedOn: '2026-07-29',
    mealPeriodSnapshot: null,
    note: null,
    rating: null,
    photoIds: [],
    updatedAt: CREATED_AT,
  };
  await saveJournalDraftRecord(db, draft);
  await assert.rejects(
    saveJournalDraftRecord(db, {
      ...draft,
      userId: 'user-2',
      clientId: 'client-2',
    }),
    /already owned/
  );
  assert.deepEqual(await getJournalDraftRecord(db, 'user-1', 'entry-1'), draft);
});

test('photo ownership foreign key rejects cross-user attachment metadata', async (t) => {
  const db = await makeDatabase(t);
  await createInTransaction(db, entryInput());

  await assert.rejects(
    db.runAsync(
      `INSERT INTO journal_photos (
         id, user_id, entry_id, position, width, height, created_at
       ) VALUES (
         $id, $user_id, $entry_id, 0, 100, 100, $created_at
       );`,
      {
        $id: 'photo-1',
        $user_id: 'other-user',
        $entry_id: 'entry-1',
        $created_at: CREATED_AT,
      }
    ),
    /FOREIGN KEY/
  );
});

test('a deleted photo no longer occupies its six-photo position', async (t) => {
  const db = await makeDatabase(t);
  await createInTransaction(db, entryInput());
  await db.runAsync(
    `INSERT INTO journal_photos (
       id, user_id, entry_id, position, width, height, created_at
     ) VALUES (
       'photo-1', 'user-1', 'entry-1', 0, 100, 100, $created_at
     );`,
    { $created_at: CREATED_AT }
  );
  await db.runAsync(
    "UPDATE journal_photos SET deleted_at = $deleted_at WHERE id = 'photo-1';",
    { $deleted_at: '2026-07-30T16:00:00.000Z' }
  );
  await db.runAsync(
    `INSERT INTO journal_photos (
       id, user_id, entry_id, position, width, height, created_at
     ) VALUES (
       'photo-2', 'user-1', 'entry-1', 0, 200, 200, $created_at
     );`,
    { $created_at: '2026-07-30T16:01:00.000Z' }
  );
  const active = await db.getAllAsync(
    'SELECT id FROM journal_photos WHERE deleted_at IS NULL ORDER BY id;'
  );
  assert.deepEqual(active.map((row) => row.id), ['photo-2']);
});

test('invalid dates, ratings, and photo counts are rejected before persistence', async (t) => {
  const db = await makeDatabase(t);
  await assert.rejects(
    createInTransaction(db, entryInput({ visitedOn: '2026-02-30' })),
    /valid calendar date/
  );
  await assert.rejects(
    createInTransaction(db, entryInput({ rating: 4.5 })),
    /integer/
  );
  await assert.rejects(
    createInTransaction(db, entryInput({
      photoIds: ['1', '2', '3', '4', '5', '6', '7'],
    })),
    /at most six/
  );
  const count = await db.getFirstAsync('SELECT COUNT(*) AS count FROM journal_entries;');
  assert.equal(count.count, 0);
});

test('Phase 8 sync support: photo lookups, sync-state writes, and outbox completion', async (t) => {
  const db = await makeDatabase(t);
  await saveStagedJournalPhotoRecord(db, {
    id: 'photo-1',
    userId: 'user-1',
    draftId: 'entry-1',
    position: 0,
    displayUri: 'file:///pending/display.jpg',
    thumbnailUri: 'file:///pending/thumbnail.jpg',
    width: 1200,
    height: 900,
    displayBytes: 450000,
    thumbnailBytes: 24000,
    createdAt: CREATED_AT,
  });
  await createInTransaction(db, entryInput({ photoIds: ['photo-1'] }));

  const beforeUpload = await getJournalPhotoRecord(db, 'user-1', 'photo-1');
  assert.equal(beforeUpload.syncState, 'staged');
  assert.equal(beforeUpload.displayPath, null);

  await markJournalPhotoSyncedRecord(
    db,
    'user-1',
    'photo-1',
    'user-1/entry-1/photo-1/display.jpg',
    'user-1/entry-1/photo-1/thumbnail.jpg'
  );
  const afterUpload = await getJournalPhotoRecord(db, 'user-1', 'photo-1');
  assert.equal(afterUpload.syncState, 'synced');
  assert.equal(afterUpload.displayPath, 'user-1/entry-1/photo-1/display.jpg');
  assert.equal(afterUpload.thumbnailPath, 'user-1/entry-1/photo-1/thumbnail.jpg');

  await setJournalEntrySyncStateRecord(db, 'user-1', 'entry-1', 'synced');
  const entry = await getJournalEntryRecord(db, 'user-1', 'entry-1');
  assert.equal(entry.syncState, 'synced');

  const outboxOperations = await listJournalOutboxRecords(db, 'user-1');
  assert.deepEqual(
    outboxOperations.map((operation) => operation.operationKey).sort(),
    ['entry:entry-1', 'photo:photo-1']
  );
  for (const operation of outboxOperations) {
    await removeJournalOutboxOperationRecord(db, operation.operationKey);
  }
  assert.deepEqual(await listJournalOutboxRecords(db, 'user-1'), []);
});

test('getJournalPhotoRecord only returns a soft-deleted photo when includeDeleted is set', async (t) => {
  const db = await makeDatabase(t);
  await saveStagedJournalPhotoRecord(db, {
    id: 'photo-1',
    userId: 'user-1',
    draftId: 'entry-1',
    position: 0,
    displayUri: 'file:///pending/display.jpg',
    thumbnailUri: 'file:///pending/thumbnail.jpg',
    width: 1200,
    height: 900,
    displayBytes: 450000,
    thumbnailBytes: 24000,
    createdAt: CREATED_AT,
  });
  await createInTransaction(db, entryInput({ photoIds: ['photo-1'] }));
  await db.runAsync(
    "UPDATE journal_photos SET deleted_at = $deleted_at WHERE id = 'photo-1';",
    { $deleted_at: '2026-07-30T16:00:00.000Z' }
  );

  assert.equal(await getJournalPhotoRecord(db, 'user-1', 'photo-1'), null);
  const found = await getJournalPhotoRecord(db, 'user-1', 'photo-1', true);
  assert.equal(found.id, 'photo-1');
  assert.equal(found.deletedAt, '2026-07-30T16:00:00.000Z');
});

test('listJournalPhotoIdsForEntry includes soft-deleted photos for storage cleanup', async (t) => {
  const db = await makeDatabase(t);
  await db.runAsync(
    `INSERT INTO journal_entries (
       id, user_id, client_id, restaurant_id, restaurant_name_snapshot,
       visited_on, sync_state, created_at, updated_at
     ) VALUES (
       'entry-1', 'user-1', 'client-1', 'restaurant-a', 'Restaurant A',
       '2026-07-29', 'synced', $created_at, $created_at
     );`,
    { $created_at: CREATED_AT }
  );
  await db.runAsync(
    `INSERT INTO journal_photos (
       id, user_id, entry_id, position, width, height, created_at
     ) VALUES (
       'photo-1', 'user-1', 'entry-1', 0, 200, 200, $created_at
     );`,
    { $created_at: CREATED_AT }
  );
  await db.runAsync(
    `INSERT INTO journal_photos (
       id, user_id, entry_id, position, width, height, created_at, deleted_at
     ) VALUES (
       'photo-2', 'user-1', 'entry-1', 1, 200, 200, $created_at, $created_at
     );`,
    { $created_at: CREATED_AT }
  );

  const ids = await listJournalPhotoIdsForEntry(db, 'user-1', 'entry-1');
  assert.deepEqual(ids.sort(), ['photo-1', 'photo-2']);
});

test('markJournalPhotoOrphanedRecord soft-deletes a photo whose local file is gone', async (t) => {
  const db = await makeDatabase(t);
  await saveStagedJournalPhotoRecord(db, {
    id: 'photo-1',
    userId: 'user-1',
    draftId: 'entry-1',
    position: 0,
    displayUri: 'file:///stale-container/display.jpg',
    thumbnailUri: 'file:///stale-container/thumbnail.jpg',
    width: 1200,
    height: 900,
    displayBytes: 450000,
    thumbnailBytes: 24000,
    createdAt: CREATED_AT,
  });
  await createInTransaction(db, entryInput({ photoIds: ['photo-1'] }));

  await markJournalPhotoOrphanedRecord(db, 'user-1', 'photo-1', '2026-07-30T16:00:00.000Z');

  assert.equal(await getJournalPhotoRecord(db, 'user-1', 'photo-1'), null);
  const orphaned = await getJournalPhotoRecord(db, 'user-1', 'photo-1', true);
  assert.equal(orphaned.deletedAt, '2026-07-30T16:00:00.000Z');
  assert.equal(orphaned.syncState, 'failed');
  // Excluded from the active photo list a sync pass uses to decide whether
  // an entry is fully synced, the same way a normal removal is.
  assert.deepEqual(await listJournalPhotoRecords(db, 'user-1', 'entry-1'), []);
});

test('failJournalOutboxOperationRecord retries quietly, then surfaces as failed', async (t) => {
  const db = await makeDatabase(t);
  await createInTransaction(db, entryInput());
  const [operation] = await listJournalOutboxRecords(db, 'user-1');

  for (let attempt = 1; attempt < 5; attempt += 1) {
    await failJournalOutboxOperationRecord(
      db,
      operation.operationKey,
      'network error',
      CREATED_AT
    );
    const [current] = await listJournalOutboxRecords(db, 'user-1');
    assert.equal(current.state, 'pending');
    assert.equal(current.attemptCount, attempt);
  }

  await failJournalOutboxOperationRecord(
    db,
    operation.operationKey,
    'network error',
    CREATED_AT
  );
  const [failed] = await listJournalOutboxRecords(db, 'user-1');
  assert.equal(failed.state, 'failed');
  assert.equal(failed.attemptCount, 5);
  assert.equal(failed.lastError, 'network error');
});
