import { ensureGotItEvent } from './activitySql.ts';
import type {
  CreateJournalEntryInput,
  JournalDeleteMode,
  JournalEntry,
  JournalEntryDraft,
  JournalEntryQuery,
  JournalOutboxOperation,
  JournalPhoto,
  StagedJournalPhoto,
  UpdateJournalEntryInput,
} from './journal.ts';
import type { SqlDatabase, SqlParameters } from './sqlDatabase.ts';

interface JournalEntryRow {
  id: string;
  user_id: string;
  client_id: string;
  restaurant_id: string;
  item_id: string | null;
  restaurant_name_snapshot: string;
  item_name_snapshot: string | null;
  visited_on: string;
  meal_period_snapshot: string | null;
  note: string | null;
  sync_state: JournalEntry['syncState'];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface JournalDraftRow {
  id: string;
  user_id: string;
  client_id: string;
  restaurant_id: string;
  item_id: string | null;
  restaurant_name_snapshot: string;
  item_name_snapshot: string | null;
  visited_on: string;
  meal_period_snapshot: string | null;
  note: string | null;
  rating: number | null;
  photo_ids_json: string;
  updated_at: string;
}

interface JournalPhotoRow {
  id: string;
  user_id: string;
  entry_id: string;
  position: number;
  local_uri: string | null;
  display_path: string | null;
  thumbnail_path: string | null;
  local_thumbnail_uri: string | null;
  width: number;
  height: number;
  display_bytes: number | null;
  thumbnail_bytes: number | null;
  sync_state: JournalPhoto['syncState'];
  created_at: string;
  deleted_at: string | null;
}

interface JournalOutboxRow {
  operation_key: string;
  user_id: string;
  entity_type: JournalOutboxOperation['entityType'];
  entity_id: string;
  operation_type: JournalOutboxOperation['operationType'];
  state: JournalOutboxOperation['state'];
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface StagedJournalPhotoRow {
  id: string;
  user_id: string;
  draft_id: string;
  position: number;
  display_uri: string;
  thumbnail_uri: string;
  width: number;
  height: number;
  display_bytes: number;
  thumbnail_bytes: number;
  created_at: string;
}

function requireText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required.`);
}

function validateVisitedOn(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Visit date must use YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error('Visit date is not a valid calendar date.');
  }
}

// Journal owns the calendar date for its linked Got It visit. Noon UTC
// avoids the common previous-day shift when the activity history formats
// the timestamp in North American time zones.
function gotItOccurredAt(visitedOn: string): string {
  return `${visitedOn}T12:00:00.000Z`;
}

function validateRating(rating: number | null): void {
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error('Journal rating must be an integer from 1 through 5.');
  }
}

function validatePhotoIds(photoIds: string[]): void {
  if (photoIds.length > 6) {
    throw new Error('A Journal entry can contain at most six photos.');
  }
  if (new Set(photoIds).size !== photoIds.length) {
    throw new Error('A Journal entry cannot contain the same photo twice.');
  }
}

function validateTarget(
  restaurantId: string,
  itemId: string | null,
  restaurantName: string,
  itemName: string | null
): void {
  requireText(restaurantId, 'Restaurant ID');
  requireText(restaurantName, 'Restaurant name');
  if (itemId === null && itemName !== null) {
    throw new Error('A restaurant-only Journal entry cannot have an item name.');
  }
  if (itemId !== null) {
    requireText(itemId, 'Item ID');
    if (itemName === null) throw new Error('An item Journal entry requires an item name.');
    requireText(itemName, 'Item name');
  }
}

function validateCreateInput(input: CreateJournalEntryInput): void {
  requireText(input.id, 'Journal entry ID');
  requireText(input.userId, 'User ID');
  requireText(input.clientId, 'Client ID');
  validateTarget(
    input.restaurantId,
    input.itemId,
    input.restaurantNameSnapshot,
    input.itemNameSnapshot
  );
  validateVisitedOn(input.visitedOn);
  validateRating(input.rating);
  validatePhotoIds(input.photoIds);
}

function rowToEntry(row: JournalEntryRow): JournalEntry {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    restaurantId: row.restaurant_id,
    itemId: row.item_id,
    restaurantNameSnapshot: row.restaurant_name_snapshot,
    itemNameSnapshot: row.item_name_snapshot,
    visitedOn: row.visited_on,
    mealPeriodSnapshot: row.meal_period_snapshot,
    note: row.note,
    syncState: row.sync_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function rowToDraft(row: JournalDraftRow): JournalEntryDraft {
  let photoIds: string[] = [];
  try {
    const parsed = JSON.parse(row.photo_ids_json);
    if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
      photoIds = parsed;
    }
  } catch {
    // A corrupt draft photo list should not make the rest of the draft
    // unrecoverable. Media reconciliation can discard orphaned staging.
  }
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    restaurantId: row.restaurant_id,
    itemId: row.item_id,
    restaurantNameSnapshot: row.restaurant_name_snapshot,
    itemNameSnapshot: row.item_name_snapshot,
    visitedOn: row.visited_on,
    mealPeriodSnapshot: row.meal_period_snapshot,
    note: row.note,
    rating: row.rating,
    photoIds,
    updatedAt: row.updated_at,
  };
}

function rowToPhoto(row: JournalPhotoRow): JournalPhoto {
  return {
    id: row.id,
    userId: row.user_id,
    entryId: row.entry_id,
    position: row.position,
    localUri: row.local_uri,
    localThumbnailUri: row.local_thumbnail_uri,
    displayPath: row.display_path,
    thumbnailPath: row.thumbnail_path,
    width: row.width,
    height: row.height,
    displayBytes: row.display_bytes,
    thumbnailBytes: row.thumbnail_bytes,
    syncState: row.sync_state,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function rowToOutbox(row: JournalOutboxRow): JournalOutboxOperation {
  return {
    operationKey: row.operation_key,
    userId: row.user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operationType: row.operation_type,
    state: row.state,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToStagedPhoto(row: StagedJournalPhotoRow): StagedJournalPhoto {
  return {
    id: row.id,
    userId: row.user_id,
    draftId: row.draft_id,
    position: row.position,
    displayUri: row.display_uri,
    thumbnailUri: row.thumbnail_uri,
    width: row.width,
    height: row.height,
    displayBytes: row.display_bytes,
    thumbnailBytes: row.thumbnail_bytes,
    createdAt: row.created_at,
  };
}

async function queueEntryOperation(
  db: SqlDatabase,
  entryId: string,
  userId: string,
  operationType: 'entry_upsert' | 'entry_delete',
  now: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO journal_outbox (
       operation_key, user_id, entity_type, entity_id, operation_type,
       state, attempt_count, last_error, created_at, updated_at
     ) VALUES (
       $operation_key, $user_id, 'entry', $entry_id, $operation_type,
       'pending', 0, NULL, $now, $now
     )
     ON CONFLICT(operation_key) DO UPDATE SET
       operation_type = excluded.operation_type,
       state = 'pending',
       attempt_count = 0,
       last_error = NULL,
       updated_at = excluded.updated_at;`,
    {
      $operation_key: `entry:${entryId}`,
      $user_id: userId,
      $entry_id: entryId,
      $operation_type: operationType,
      $now: now,
    }
  );
}

async function queuePhotoOperation(
  db: SqlDatabase,
  photoId: string,
  userId: string,
  now: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO journal_outbox (
       operation_key, user_id, entity_type, entity_id, operation_type,
       state, attempt_count, last_error, created_at, updated_at
     ) VALUES (
       $operation_key, $user_id, 'photo', $photo_id, 'photo_upsert',
       'pending', 0, NULL, $now, $now
     )
     ON CONFLICT(operation_key) DO UPDATE SET
       operation_type = 'photo_upsert',
       state = 'pending',
       attempt_count = 0,
       last_error = NULL,
       updated_at = excluded.updated_at;`,
    {
      $operation_key: `photo:${photoId}`,
      $user_id: userId,
      $photo_id: photoId,
      $now: now,
    }
  );
}

async function promoteStagedPhotos(
  db: SqlDatabase,
  input: Pick<CreateJournalEntryInput, 'id' | 'userId' | 'photoIds'>,
  now: string
): Promise<void> {
  let promotedAny = false;
  for (const [position, photoId] of input.photoIds.entries()) {
    const staged = await db.getFirstAsync<StagedJournalPhotoRow>(
      `SELECT * FROM journal_staged_photos
       WHERE id = $id AND user_id = $user_id AND draft_id = $draft_id;`,
      {
        $id: photoId,
        $user_id: input.userId,
        $draft_id: input.id,
      }
    );
    if (!staged) {
      const existing = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM journal_photos
         WHERE id = $id AND user_id = $user_id AND entry_id = $entry_id
           AND deleted_at IS NULL;`,
        { $id: photoId, $user_id: input.userId, $entry_id: input.id }
      );
      if (!existing) throw new Error('A staged Journal photo could not be found.');
      continue;
    }
    await db.runAsync(
      `INSERT INTO journal_photos (
         id, user_id, entry_id, local_uri, local_thumbnail_uri,
         display_path, thumbnail_path, position, width, height,
         display_bytes, thumbnail_bytes, sync_state, created_at, deleted_at
       ) VALUES (
         $id, $user_id, $entry_id, $display_uri, $thumbnail_uri,
         NULL, NULL, $position, $width, $height,
         $display_bytes, $thumbnail_bytes, 'staged', $created_at, NULL
       )
       ON CONFLICT(id) DO NOTHING;`,
      {
        $id: staged.id,
        $user_id: staged.user_id,
        $entry_id: input.id,
        $display_uri: staged.display_uri,
        $thumbnail_uri: staged.thumbnail_uri,
        $position: position,
        $width: staged.width,
        $height: staged.height,
        $display_bytes: staged.display_bytes,
        $thumbnail_bytes: staged.thumbnail_bytes,
        $created_at: staged.created_at,
      }
    );
    await db.runAsync(
      'DELETE FROM journal_staged_photos WHERE id = $id AND user_id = $user_id;',
      { $id: staged.id, $user_id: staged.user_id }
    );
    await queuePhotoOperation(db, staged.id, staged.user_id, now);
    promotedAny = true;
  }
  if (promotedAny) {
    await db.runAsync(
      `UPDATE journal_entries
       SET sync_state = 'pending_photos', updated_at = $now
       WHERE id = $id AND user_id = $user_id;`,
      { $now: now, $id: input.id, $user_id: input.userId }
    );
  }
}

async function reconcileUpdatedPhotos(
  db: SqlDatabase,
  input: UpdateJournalEntryInput,
  now: string
): Promise<void> {
  validatePhotoIds(input.photoIds);
  const existing = await db.getAllAsync<JournalPhotoRow>(
    `SELECT * FROM journal_photos
     WHERE entry_id = $entry_id AND user_id = $user_id AND deleted_at IS NULL
     ORDER BY position, created_at, id;`,
    { $entry_id: input.id, $user_id: input.userId }
  );
  const selectedIds = new Set(input.photoIds);

  for (const photo of existing) {
    if (selectedIds.has(photo.id)) continue;
    await db.runAsync(
      `UPDATE journal_photos
       SET deleted_at = $now, sync_state = 'pending'
       WHERE id = $id AND user_id = $user_id;`,
      { $now: now, $id: photo.id, $user_id: input.userId }
    );
    await queuePhotoOperation(db, photo.id, input.userId, now);
  }

  for (const [position, photoId] of input.photoIds.entries()) {
    const existingPhoto = existing.find((photo) => photo.id === photoId);
    if (!existingPhoto || existingPhoto.position === position) continue;
    await db.runAsync(
      `UPDATE journal_photos
       SET position = $position, sync_state = 'pending'
       WHERE id = $id AND user_id = $user_id AND entry_id = $entry_id
         AND deleted_at IS NULL;`,
      {
        $position: position,
        $id: photoId,
        $user_id: input.userId,
        $entry_id: input.id,
      }
    );
    await queuePhotoOperation(db, photoId, input.userId, now);
  }

  await promoteStagedPhotos(db, input, now);
  if (
    existing.length !== input.photoIds.length
    || existing.some((photo, position) => input.photoIds[position] !== photo.id)
  ) {
    await db.runAsync(
      `UPDATE journal_entries
       SET sync_state = 'pending_photos', updated_at = $now
       WHERE id = $id AND user_id = $user_id;`,
      { $now: now, $id: input.id, $user_id: input.userId }
    );
  }
}

function assertSameCreate(existing: JournalEntryRow, input: CreateJournalEntryInput): void {
  const matches =
    existing.id === input.id
    && existing.user_id === input.userId
    && existing.client_id === input.clientId
    && existing.restaurant_id === input.restaurantId
    && existing.item_id === input.itemId;
  if (!matches) {
    throw new Error('The Journal entry ID or client ID is already in use.');
  }
}

export interface CreateJournalEntryResult {
  entry: JournalEntry;
  created: boolean;
}

export async function createJournalEntryRecord(
  db: SqlDatabase,
  input: CreateJournalEntryInput,
  now: string
): Promise<CreateJournalEntryResult> {
  validateCreateInput(input);
  const existing = await db.getFirstAsync<JournalEntryRow>(
    `SELECT * FROM journal_entries
     WHERE id = $id OR (user_id = $user_id AND client_id = $client_id)
     LIMIT 1;`,
    {
      $id: input.id,
      $user_id: input.userId,
      $client_id: input.clientId,
    }
  );

  if (existing) {
    assertSameCreate(existing, input);
    if (existing.deleted_at !== null) {
      throw new Error('A deleted Journal entry cannot be recreated with the same ID.');
    }
    await ensureGotItEvent(db, {
      clientId: input.clientId,
      restaurantId: input.restaurantId,
      itemId: input.itemId,
      rating: input.rating,
      occurredAt: gotItOccurredAt(existing.visited_on),
      createdAt: existing.created_at,
    });
    await promoteStagedPhotos(db, input, now);
    // A retried save can arrive after a late autosave recreated the draft.
    // Successful entry creation always wins over that stale draft.
    await db.runAsync(
      'DELETE FROM journal_drafts WHERE id = $id AND user_id = $user_id;',
      { $id: input.id, $user_id: input.userId }
    );
    await queueEntryOperation(db, input.id, input.userId, 'entry_upsert', now);
    return { entry: rowToEntry(existing), created: false };
  }

  await ensureGotItEvent(db, {
    clientId: input.clientId,
    restaurantId: input.restaurantId,
    itemId: input.itemId,
    rating: input.rating,
    occurredAt: gotItOccurredAt(input.visitedOn),
    createdAt: now,
  });
  await db.runAsync(
    `INSERT INTO journal_entries (
       id, user_id, client_id, restaurant_id, item_id,
       restaurant_name_snapshot, item_name_snapshot, visited_on,
       meal_period_snapshot, note, sync_state, created_at, updated_at, deleted_at
     ) VALUES (
       $id, $user_id, $client_id, $restaurant_id, $item_id,
       $restaurant_name_snapshot, $item_name_snapshot, $visited_on,
       $meal_period_snapshot, $note, 'pending_entry', $now, $now, NULL
     );`,
    {
      $id: input.id,
      $user_id: input.userId,
      $client_id: input.clientId,
      $restaurant_id: input.restaurantId,
      $item_id: input.itemId,
      $restaurant_name_snapshot: input.restaurantNameSnapshot,
      $item_name_snapshot: input.itemNameSnapshot,
      $visited_on: input.visitedOn,
      $meal_period_snapshot: input.mealPeriodSnapshot,
      $note: input.note,
      $now: now,
    }
  );
  await promoteStagedPhotos(db, input, now);
  await db.runAsync(
    'DELETE FROM journal_drafts WHERE id = $id AND user_id = $user_id;',
    { $id: input.id, $user_id: input.userId }
  );
  await queueEntryOperation(db, input.id, input.userId, 'entry_upsert', now);

  const created = await getJournalEntryRecord(db, input.userId, input.id, true);
  if (!created) throw new Error('Journal entry creation did not persist.');
  return { entry: created, created: true };
}

export async function updateJournalEntryRecord(
  db: SqlDatabase,
  input: UpdateJournalEntryInput,
  now: string
): Promise<JournalEntry> {
  requireText(input.id, 'Journal entry ID');
  requireText(input.userId, 'User ID');
  validateVisitedOn(input.visitedOn);
  validateRating(input.rating);
  validatePhotoIds(input.photoIds);
  const existing = await db.getFirstAsync<JournalEntryRow>(
    `SELECT * FROM journal_entries
     WHERE id = $id AND user_id = $user_id AND deleted_at IS NULL;`,
    { $id: input.id, $user_id: input.userId }
  );
  if (!existing) throw new Error('Journal entry was not found.');

  await ensureGotItEvent(db, {
    clientId: existing.client_id,
    restaurantId: existing.restaurant_id,
    itemId: existing.item_id,
    rating: input.rating,
    occurredAt: gotItOccurredAt(input.visitedOn),
    createdAt: existing.created_at,
  });
  await db.runAsync(
    `UPDATE activity
     SET value = $rating, occurred_at = $occurred_at, updated_at = $now
     WHERE client_id = $client_id AND activity_type = 'got_it' AND deleted = 0;`,
    {
      $rating: input.rating,
      $occurred_at: gotItOccurredAt(input.visitedOn),
      $now: now,
      $client_id: existing.client_id,
    }
  );
  await db.runAsync(
    `UPDATE journal_entries
     SET visited_on = $visited_on,
         meal_period_snapshot = $meal_period_snapshot,
         note = $note,
         sync_state = 'pending_entry',
         updated_at = $now
     WHERE id = $id AND user_id = $user_id AND deleted_at IS NULL;`,
    {
      $visited_on: input.visitedOn,
      $meal_period_snapshot: input.mealPeriodSnapshot,
      $note: input.note,
      $now: now,
      $id: input.id,
      $user_id: input.userId,
    }
  );
  await reconcileUpdatedPhotos(db, input, now);
  await queueEntryOperation(db, input.id, input.userId, 'entry_upsert', now);

  const updated = await getJournalEntryRecord(db, input.userId, input.id);
  if (!updated) throw new Error('Journal entry update did not persist.');
  return updated;
}

export async function deleteJournalEntryRecord(
  db: SqlDatabase,
  userId: string,
  entryId: string,
  mode: JournalDeleteMode,
  now: string
): Promise<boolean> {
  requireText(userId, 'User ID');
  requireText(entryId, 'Journal entry ID');
  const existing = await db.getFirstAsync<JournalEntryRow>(
    'SELECT * FROM journal_entries WHERE id = $id AND user_id = $user_id;',
    { $id: entryId, $user_id: userId }
  );
  if (!existing) return false;

  await db.runAsync(
    `UPDATE journal_entries
     SET deleted_at = COALESCE(deleted_at, $now),
         sync_state = 'pending_entry',
         updated_at = $now
     WHERE id = $id AND user_id = $user_id;`,
    { $now: now, $id: entryId, $user_id: userId }
  );
  await db.runAsync(
    `UPDATE journal_photos
     SET deleted_at = COALESCE(deleted_at, $now), sync_state = 'pending'
     WHERE entry_id = $id AND user_id = $user_id;`,
    { $now: now, $id: entryId, $user_id: userId }
  );
  if (mode === 'journal_and_got_it') {
    await db.runAsync(
      `UPDATE activity
       SET deleted = 1, updated_at = $now
       WHERE client_id = $client_id AND activity_type = 'got_it';`,
      { $now: now, $client_id: existing.client_id }
    );
  }
  await queueEntryOperation(db, entryId, userId, 'entry_delete', now);
  return existing.deleted_at === null;
}

export async function getJournalEntryRecord(
  db: SqlDatabase,
  userId: string,
  entryId: string,
  includeDeleted = false
): Promise<JournalEntry | null> {
  const row = await db.getFirstAsync<JournalEntryRow>(
    `SELECT * FROM journal_entries
     WHERE id = $id AND user_id = $user_id
       ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
     LIMIT 1;`,
    { $id: entryId, $user_id: userId }
  );
  return row ? rowToEntry(row) : null;
}

export async function listJournalEntryRecords(
  db: SqlDatabase,
  query: JournalEntryQuery
): Promise<JournalEntry[]> {
  requireText(query.userId, 'User ID');
  const clauses = ['user_id = $user_id'];
  const params: SqlParameters = { $user_id: query.userId };
  if (!query.includeDeleted) clauses.push('deleted_at IS NULL');
  if (query.restaurantId !== undefined) {
    clauses.push('restaurant_id = $restaurant_id');
    params.$restaurant_id = query.restaurantId;
  }
  if ('itemId' in query) {
    if (query.itemId === null) {
      clauses.push('item_id IS NULL');
    } else if (query.itemId !== undefined) {
      clauses.push('item_id = $item_id');
      params.$item_id = query.itemId;
    }
  }
  if (query.startDate != null) {
    validateVisitedOn(query.startDate);
    clauses.push('visited_on >= $start_date');
    params.$start_date = query.startDate;
  }
  if (query.endDate != null) {
    validateVisitedOn(query.endDate);
    clauses.push('visited_on <= $end_date');
    params.$end_date = query.endDate;
  }

  const rows = await db.getAllAsync<JournalEntryRow>(
    `SELECT * FROM journal_entries
     WHERE ${clauses.join(' AND ')}
     ORDER BY visited_on DESC, updated_at DESC, id DESC;`,
    params
  );
  return rows.map(rowToEntry);
}

export async function listJournalPhotoRecords(
  db: SqlDatabase,
  userId: string,
  entryId?: string
): Promise<JournalPhoto[]> {
  const rows = await db.getAllAsync<JournalPhotoRow>(
    `SELECT * FROM journal_photos
     WHERE user_id = $user_id AND deleted_at IS NULL
       ${entryId ? 'AND entry_id = $entry_id' : ''}
     ORDER BY entry_id, position, created_at, id;`,
    entryId
      ? { $user_id: userId, $entry_id: entryId }
      : { $user_id: userId }
  );
  return rows.map(rowToPhoto);
}

export async function getJournalPhotoRecord(
  db: SqlDatabase,
  userId: string,
  photoId: string,
  includeDeleted = false
): Promise<JournalPhoto | null> {
  const row = await db.getFirstAsync<JournalPhotoRow>(
    `SELECT * FROM journal_photos
     WHERE id = $id AND user_id = $user_id
       ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
     LIMIT 1;`,
    { $id: photoId, $user_id: userId }
  );
  return row ? rowToPhoto(row) : null;
}

// Every photo id ever attached to an entry, including soft-deleted ones --
// used by sync to find every storage object that must be removed when an
// entry is deleted, since deleteJournalEntryRecord soft-deletes all of an
// entry's photos in bulk without queuing a separate outbox operation per
// photo (the single entry_delete operation covers all of them).
export async function listJournalPhotoIdsForEntry(
  db: SqlDatabase,
  userId: string,
  entryId: string
): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM journal_photos WHERE user_id = $user_id AND entry_id = $entry_id;`,
    { $user_id: userId, $entry_id: entryId }
  );
  return rows.map((row) => row.id);
}

export async function markJournalPhotoSyncedRecord(
  db: SqlDatabase,
  userId: string,
  photoId: string,
  displayPath: string,
  thumbnailPath: string
): Promise<void> {
  await db.runAsync(
    `UPDATE journal_photos
     SET display_path = $display_path,
         thumbnail_path = $thumbnail_path,
         sync_state = 'synced'
     WHERE id = $id AND user_id = $user_id;`,
    {
      $display_path: displayPath,
      $thumbnail_path: thumbnailPath,
      $id: photoId,
      $user_id: userId,
    }
  );
}

export async function setJournalEntrySyncStateRecord(
  db: SqlDatabase,
  userId: string,
  entryId: string,
  syncState: JournalEntry['syncState']
): Promise<void> {
  await db.runAsync(
    `UPDATE journal_entries SET sync_state = $sync_state
     WHERE id = $id AND user_id = $user_id;`,
    { $sync_state: syncState, $id: entryId, $user_id: userId }
  );
}

// A photo whose staged local file no longer exists (most commonly an iOS
// sandbox container reassigned on a rebuild/reinstall, orphaning anything
// staged before that point) can never be uploaded -- there are no bytes
// left to recover. Soft-deleting it here is what stops sync from retrying
// it forever and stops the app from trying to render a file that's gone.
export async function markJournalPhotoOrphanedRecord(
  db: SqlDatabase,
  userId: string,
  photoId: string,
  now: string
): Promise<void> {
  await db.runAsync(
    `UPDATE journal_photos
     SET deleted_at = COALESCE(deleted_at, $now), sync_state = 'failed'
     WHERE id = $id AND user_id = $user_id;`,
    { $now: now, $id: photoId, $user_id: userId }
  );
}

export async function saveJournalDraftRecord(
  db: SqlDatabase,
  draft: JournalEntryDraft
): Promise<void> {
  requireText(draft.id, 'Journal draft ID');
  requireText(draft.userId, 'User ID');
  requireText(draft.clientId, 'Client ID');
  validateTarget(
    draft.restaurantId,
    draft.itemId,
    draft.restaurantNameSnapshot,
    draft.itemNameSnapshot
  );
  validateVisitedOn(draft.visitedOn);
  validateRating(draft.rating);
  if (draft.photoIds.length > 6) {
    throw new Error('A Journal draft can contain at most six photos.');
  }

  const result = await db.runAsync(
    `INSERT INTO journal_drafts (
       id, user_id, client_id, restaurant_id, item_id,
       restaurant_name_snapshot, item_name_snapshot, visited_on,
       meal_period_snapshot, note, rating, photo_ids_json, updated_at
     ) VALUES (
       $id, $user_id, $client_id, $restaurant_id, $item_id,
       $restaurant_name_snapshot, $item_name_snapshot, $visited_on,
       $meal_period_snapshot, $note, $rating, $photo_ids_json, $updated_at
     )
     ON CONFLICT(id) DO UPDATE SET
       restaurant_id = excluded.restaurant_id,
       item_id = excluded.item_id,
       restaurant_name_snapshot = excluded.restaurant_name_snapshot,
       item_name_snapshot = excluded.item_name_snapshot,
       visited_on = excluded.visited_on,
       meal_period_snapshot = excluded.meal_period_snapshot,
       note = excluded.note,
       rating = excluded.rating,
       photo_ids_json = excluded.photo_ids_json,
       updated_at = excluded.updated_at
     WHERE journal_drafts.user_id = excluded.user_id
       AND journal_drafts.client_id = excluded.client_id;`,
    {
      $id: draft.id,
      $user_id: draft.userId,
      $client_id: draft.clientId,
      $restaurant_id: draft.restaurantId,
      $item_id: draft.itemId,
      $restaurant_name_snapshot: draft.restaurantNameSnapshot,
      $item_name_snapshot: draft.itemNameSnapshot,
      $visited_on: draft.visitedOn,
      $meal_period_snapshot: draft.mealPeriodSnapshot,
      $note: draft.note,
      $rating: draft.rating,
      $photo_ids_json: JSON.stringify(draft.photoIds),
      $updated_at: draft.updatedAt,
    }
  );
  if (result.changes === 0) {
    throw new Error('The Journal draft ID is already owned by another entry or user.');
  }
}

export async function getJournalDraftRecord(
  db: SqlDatabase,
  userId: string,
  draftId: string
): Promise<JournalEntryDraft | null> {
  const row = await db.getFirstAsync<JournalDraftRow>(
    'SELECT * FROM journal_drafts WHERE id = $id AND user_id = $user_id;',
    { $id: draftId, $user_id: userId }
  );
  return row ? rowToDraft(row) : null;
}

export async function getLatestJournalDraftRecord(
  db: SqlDatabase,
  userId: string
): Promise<JournalEntryDraft | null> {
  requireText(userId, 'User ID');
  const row = await db.getFirstAsync<JournalDraftRow>(
    `SELECT * FROM journal_drafts
     WHERE user_id = $user_id
     ORDER BY updated_at DESC, id DESC
     LIMIT 1;`,
    { $user_id: userId }
  );
  return row ? rowToDraft(row) : null;
}

export async function deleteJournalDraftRecord(
  db: SqlDatabase,
  userId: string,
  draftId: string
): Promise<boolean> {
  const result = await db.runAsync(
    'DELETE FROM journal_drafts WHERE id = $id AND user_id = $user_id;',
    { $id: draftId, $user_id: userId }
  );
  return result.changes > 0;
}

export async function saveStagedJournalPhotoRecord(
  db: SqlDatabase,
  photo: StagedJournalPhoto
): Promise<void> {
  requireText(photo.id, 'Journal photo ID');
  requireText(photo.userId, 'User ID');
  requireText(photo.draftId, 'Journal draft ID');
  if (photo.position < 0 || photo.position >= 6) {
    throw new Error('Journal photo position is out of range.');
  }
  await db.runAsync(
    `INSERT INTO journal_staged_photos (
       id, user_id, draft_id, position, display_uri, thumbnail_uri,
       width, height, display_bytes, thumbnail_bytes, created_at
     ) VALUES (
       $id, $user_id, $draft_id, $position, $display_uri, $thumbnail_uri,
       $width, $height, $display_bytes, $thumbnail_bytes, $created_at
     )
     ON CONFLICT(id) DO UPDATE SET
       position = excluded.position,
       display_uri = excluded.display_uri,
       thumbnail_uri = excluded.thumbnail_uri,
       width = excluded.width,
       height = excluded.height,
       display_bytes = excluded.display_bytes,
       thumbnail_bytes = excluded.thumbnail_bytes
     WHERE journal_staged_photos.user_id = excluded.user_id
       AND journal_staged_photos.draft_id = excluded.draft_id;`,
    {
      $id: photo.id,
      $user_id: photo.userId,
      $draft_id: photo.draftId,
      $position: photo.position,
      $display_uri: photo.displayUri,
      $thumbnail_uri: photo.thumbnailUri,
      $width: photo.width,
      $height: photo.height,
      $display_bytes: photo.displayBytes,
      $thumbnail_bytes: photo.thumbnailBytes,
      $created_at: photo.createdAt,
    }
  );
}

export async function listStagedJournalPhotoRecords(
  db: SqlDatabase,
  userId: string,
  draftId: string
): Promise<StagedJournalPhoto[]> {
  const rows = await db.getAllAsync<StagedJournalPhotoRow>(
    `SELECT * FROM journal_staged_photos
     WHERE user_id = $user_id AND draft_id = $draft_id
     ORDER BY position, created_at, id;`,
    { $user_id: userId, $draft_id: draftId }
  );
  return rows.map(rowToStagedPhoto);
}

export async function deleteStagedJournalPhotoRecord(
  db: SqlDatabase,
  userId: string,
  photoId: string
): Promise<boolean> {
  const result = await db.runAsync(
    'DELETE FROM journal_staged_photos WHERE id = $id AND user_id = $user_id;',
    { $id: photoId, $user_id: userId }
  );
  return result.changes > 0;
}

export async function countPendingJournalPhotoRecords(
  db: SqlDatabase,
  userId: string
): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM journal_staged_photos WHERE user_id = $user_id)
       +
       (SELECT COUNT(*) FROM journal_photos
        WHERE user_id = $user_id AND deleted_at IS NULL AND sync_state != 'synced')
     ) AS count;`,
    { $user_id: userId }
  );
  return row?.count ?? 0;
}

export async function listJournalOutboxRecords(
  db: SqlDatabase,
  userId: string
): Promise<JournalOutboxOperation[]> {
  const rows = await db.getAllAsync<JournalOutboxRow>(
    `SELECT * FROM journal_outbox
     WHERE user_id = $user_id
     ORDER BY created_at, operation_key;`,
    { $user_id: userId }
  );
  return rows.map(rowToOutbox);
}

export async function removeJournalOutboxOperationRecord(
  db: SqlDatabase,
  operationKey: string
): Promise<void> {
  await db.runAsync('DELETE FROM journal_outbox WHERE operation_key = $operation_key;', {
    $operation_key: operationKey,
  });
}

// A transient failure (offline, a dropped connection mid-upload) should
// retry quietly on the next trigger. Only a run of failures becomes a
// user-visible 'failed' state -- surfacing every single blip would make
// "sync failed" noise the normal case for anyone syncing on a spotty park
// connection.
const OUTBOX_FAILURE_THRESHOLD = 5;

export async function failJournalOutboxOperationRecord(
  db: SqlDatabase,
  operationKey: string,
  errorMessage: string,
  now: string
): Promise<void> {
  await db.runAsync(
    `UPDATE journal_outbox
     SET attempt_count = attempt_count + 1,
         last_error = $last_error,
         state = CASE
           WHEN attempt_count + 1 >= $threshold THEN 'failed'
           ELSE 'pending'
         END,
         updated_at = $now
     WHERE operation_key = $operation_key;`,
    {
      $last_error: errorMessage,
      $threshold: OUTBOX_FAILURE_THRESHOLD,
      $now: now,
      $operation_key: operationKey,
    }
  );
}
