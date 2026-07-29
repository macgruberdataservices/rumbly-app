import { ensureGotItEvent } from './activitySql.ts';
import type {
  CreateJournalEntryInput,
  JournalDeleteMode,
  JournalEntry,
  JournalEntryDraft,
  JournalEntryQuery,
  JournalOutboxOperation,
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
  if (input.photoIds.length > 6) {
    throw new Error('A Journal entry can contain at most six photos.');
  }
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
