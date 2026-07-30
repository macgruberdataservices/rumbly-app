// Phase 8: push-only sync of the local Journal outbox to Supabase.
//
// Unlike activity's sync.ts (a two-way diff/merge over the whole table),
// Journal already tracks exactly what changed via journal_outbox --
// createJournalEntryRecord/updateJournalEntryRecord/deleteJournalEntryRecord
// enqueue one operation per entry mutation, and photo staging/removal
// enqueue one per photo. Draining that queue in order is both simpler and
// more precise than a full-table diff, and it's what the local schema was
// already built for. There is deliberately no pull path here yet -- nothing
// in the outbox design assumes multi-device convergence, and building that
// is a separate concern from what Phase 8 asks for.
//
// Idempotency: every push is a Supabase upsert keyed on the row's own
// stable id (entries) or the deterministic {userId}/{entryId}/{photoId}/...
// storage path (photos), and storage.remove()/a soft-delete update are
// no-ops if already applied. A retried operation after a partial failure
// (e.g. photo bytes uploaded but the metadata upsert didn't complete) is
// always safe to run again.

import {
  deleteSavedJournalPhotoFiles,
  resolvePendingJournalPhotoFile,
} from '../media/journalPhotoStorage';
import type { JournalEntry, JournalOutboxOperation, JournalPhoto } from './journal';
import {
  failLocalJournalOutboxOperation,
  getLocalJournalEntry,
  getLocalJournalPhoto,
  listLocalJournalOutbox,
  listLocalJournalPhotoIdsForEntry,
  listLocalJournalPhotos,
  markLocalJournalPhotoOrphaned,
  markLocalJournalPhotoSynced,
  removeLocalJournalOutboxOperation,
  setLocalJournalEntrySyncState,
} from './journalStore';
import { supabase } from './supabaseClient';

const JOURNAL_PHOTOS_BUCKET = 'journal-photos';

let inFlight: Promise<void> | null = null;
let queuedUserId: string | null = null;

export function syncJournal(userId: string): Promise<void> {
  queuedUserId = userId;
  if (!inFlight) {
    inFlight = drainSyncQueue().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function drainSyncQueue(): Promise<void> {
  while (queuedUserId) {
    const userId = queuedUserId;
    queuedUserId = null;
    await runSync(userId);
  }
}

async function runSync(userId: string): Promise<void> {
  const operations = await listLocalJournalOutbox(userId);
  for (const operation of operations) {
    try {
      const affectedEntryId = await processOperation(operation);
      await removeLocalJournalOutboxOperation(operation.operationKey);
      if (affectedEntryId) await recomputeEntrySyncState(userId, affectedEntryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Journal sync failed for ${operation.operationKey}:`, message);
      await failLocalJournalOutboxOperation(operation.operationKey, message);
    }
  }
}

// Returns the entry id the operation affected, so the caller can recompute
// that entry's derived sync_state once the outbox row is actually gone --
// not from in here, where the outbox row (and therefore the "is this
// entry still pending" check) hasn't been cleared yet.
async function processOperation(operation: JournalOutboxOperation): Promise<string | null> {
  switch (operation.operationType) {
    case 'entry_upsert':
      await pushEntry(operation.userId, operation.entityId);
      return operation.entityId;
    case 'entry_delete':
      await pushEntry(operation.userId, operation.entityId);
      await cascadeDeleteEntryPhotos(operation.userId, operation.entityId);
      return operation.entityId;
    case 'photo_upsert':
    case 'photo_delete':
      return pushPhoto(operation.userId, operation.entityId);
  }
}

async function pushEntry(userId: string, entryId: string): Promise<void> {
  const entry = await getLocalJournalEntry(userId, entryId, true);
  if (!entry) return;
  const { error } = await supabase.from('journal_entries').upsert(
    {
      id: entry.id,
      user_id: userId,
      client_id: entry.clientId,
      restaurant_id: entry.restaurantId,
      item_id: entry.itemId,
      restaurant_name_snapshot: entry.restaurantNameSnapshot,
      item_name_snapshot: entry.itemNameSnapshot,
      visited_on: entry.visitedOn,
      meal_period_snapshot: entry.mealPeriodSnapshot,
      note: entry.note,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt,
      deleted_at: entry.deletedAt,
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(error.message);
}

// The local delete path soft-deletes every photo on the entry in one bulk
// UPDATE and queues a single entry_delete operation -- not one photo_upsert
// per photo -- so this is the only place that cleans up those photos'
// remote metadata and storage blobs.
async function cascadeDeleteEntryPhotos(userId: string, entryId: string): Promise<void> {
  const photoIds = await listLocalJournalPhotoIdsForEntry(userId, entryId);
  if (photoIds.length === 0) return;

  const paths = photoIds.flatMap((photoId) => photoObjectPaths(userId, entryId, photoId));
  const { error: removeError } = await supabase.storage
    .from(JOURNAL_PHOTOS_BUCKET)
    .remove(paths);
  if (removeError) throw new Error(removeError.message);

  const { error: metaError } = await supabase
    .from('journal_photos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('entry_id', entryId);
  if (metaError) throw new Error(metaError.message);
}

function photoObjectPaths(userId: string, entryId: string, photoId: string): [string, string] {
  const prefix = `${userId}/${entryId}/${photoId}`;
  return [`${prefix}/display.jpg`, `${prefix}/thumbnail.jpg`];
}

async function pushPhoto(userId: string, photoId: string): Promise<string | null> {
  const photo = await getLocalJournalPhoto(userId, photoId, true);
  if (!photo) return null;

  if (photo.deletedAt) {
    await pushPhotoDeletion(photo);
    return photo.entryId;
  }

  // Resolved fresh against the CURRENT Paths.document rather than trusting
  // photo.localUri's stored absolute string -- iOS can reassign the app's
  // sandbox container UUID on a rebuild/reinstall, which silently
  // invalidates any previously-stored absolute path even though this
  // deterministic relative structure never changed.
  const displayFile = resolvePendingJournalPhotoFile(userId, photo.entryId, photo.id, 'display.jpg');
  const thumbnailFile = resolvePendingJournalPhotoFile(userId, photo.entryId, photo.id, 'thumbnail.jpg');
  if (!displayFile.exists || !thumbnailFile.exists) {
    // Genuinely gone, not a transient failure -- there are no bytes left
    // to upload no matter how many times this retries. Drop it so it
    // doesn't sit in the failed banner forever; the rest of the entry
    // (and any other photos on it) still syncs normally.
    console.warn(
      `Journal photo ${photoId} has no local file to upload (likely orphaned by an app reinstall) -- dropping it instead of retrying.`
    );
    await markLocalJournalPhotoOrphaned(userId, photoId);
    return photo.entryId;
  }

  const [displayPath, thumbnailPath] = photoObjectPaths(userId, photo.entryId, photo.id);

  const displayBytes = await displayFile.arrayBuffer();
  const { error: displayError } = await supabase.storage
    .from(JOURNAL_PHOTOS_BUCKET)
    .upload(displayPath, displayBytes, { contentType: 'image/jpeg', upsert: true });
  if (displayError) throw new Error(displayError.message);

  const thumbnailBytes = await thumbnailFile.arrayBuffer();
  const { error: thumbnailError } = await supabase.storage
    .from(JOURNAL_PHOTOS_BUCKET)
    .upload(thumbnailPath, thumbnailBytes, { contentType: 'image/jpeg', upsert: true });
  if (thumbnailError) throw new Error(thumbnailError.message);

  const { error: metaError } = await supabase.from('journal_photos').upsert(
    {
      id: photo.id,
      user_id: userId,
      entry_id: photo.entryId,
      display_path: displayPath,
      thumbnail_path: thumbnailPath,
      position: photo.position,
      width: photo.width,
      height: photo.height,
      display_bytes: photo.displayBytes,
      thumbnail_bytes: photo.thumbnailBytes,
      created_at: photo.createdAt,
      deleted_at: null,
    },
    { onConflict: 'id' }
  );
  if (metaError) throw new Error(metaError.message);

  // Local staging files are kept around after a successful upload -- they
  // currently double as the only way saved photos render at all (there is
  // no download-on-demand cache yet), so this deliberately does NOT reclaim
  // them the way deleteSavedJournalPhotoFiles does for an actual removal.
  await markLocalJournalPhotoSynced(userId, photoId, displayPath, thumbnailPath);
  return photo.entryId;
}

async function pushPhotoDeletion(photo: JournalPhoto): Promise<void> {
  const { error: removeError } = await supabase.storage
    .from(JOURNAL_PHOTOS_BUCKET)
    .remove(photoObjectPaths(photo.userId, photo.entryId, photo.id));
  if (removeError) throw new Error(removeError.message);

  const { error: metaError } = await supabase
    .from('journal_photos')
    .update({ deleted_at: photo.deletedAt ?? new Date().toISOString() })
    .eq('id', photo.id)
    .eq('user_id', photo.userId);
  if (metaError) throw new Error(metaError.message);

  deleteSavedJournalPhotoFiles(photo);
}

// entry_upsert/entry_delete queue under one outbox key per entry
// (`entry:{entryId}`, upserted via ON CONFLICT) so at most one can be
// pending at a time; re-checking here (after the just-finished operation's
// own outbox row was removed) avoids marking an entry 'synced' while its
// own entry-level push is still queued or mid-retry.
async function recomputeEntrySyncState(userId: string, entryId: string): Promise<void> {
  const outbox = await listLocalJournalOutbox(userId);
  const entryStillPending = outbox.some(
    (operation) => operation.entityType === 'entry' && operation.entityId === entryId
  );
  if (entryStillPending) return;

  const photos = await listLocalJournalPhotos(userId, entryId);
  const allSynced = photos.every((photo) => photo.syncState === 'synced');
  const nextState: JournalEntry['syncState'] = allSynced ? 'synced' : 'pending_photos';
  await setLocalJournalEntrySyncState(userId, entryId, nextState);
}
