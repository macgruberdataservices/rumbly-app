// Push-only sync of the local Journal outbox to Supabase.
//
// Unlike activity's sync.ts (a two-way diff/merge over the whole table),
// Journal already tracks exactly what changed via journal_outbox --
// createJournalEntryRecord/updateJournalEntryRecord/deleteJournalEntryRecord
// enqueue one operation per entry mutation. Draining that queue in order is
// both simpler and more precise than a full-table diff, and it's what the
// local schema was already built for. There is deliberately no pull path
// here yet -- nothing in the outbox design assumes multi-device
// convergence, and building that is a separate concern.
//
// Photos are local-device-only storage (see Docs/JOURNAL_BUILD_PLAN.md) --
// a fixed-price plan can't absorb storage cost that scales with per-user
// photo volume. Only entries (text/rating/date/target) sync anywhere;
// photo bytes and metadata never leave the device, so there is nothing for
// this module to push for them at all.
//
// Idempotency: every push is a Supabase upsert keyed on the entry's own
// stable id, so a retried operation is always safe to run again.

import {
  failLocalJournalOutboxOperation,
  getLocalJournalEntry,
  listLocalJournalOutbox,
  removeLocalJournalOutboxOperation,
  setLocalJournalEntrySyncState,
} from './journalStore';
import { supabase } from './supabaseClient';

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
      await pushEntry(operation.userId, operation.entityId);
      await removeLocalJournalOutboxOperation(operation.operationKey);
      await setLocalJournalEntrySyncState(operation.userId, operation.entityId, 'synced');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Journal sync failed for ${operation.operationKey}:`, message);
      await failLocalJournalOutboxOperation(operation.operationKey, message);
    }
  }
}

// entry_upsert and entry_delete both resolve to the same action: push the
// entry row's current local state, including deleted_at if it's now set.
// There's no separate remote cleanup step for a delete -- photos never had
// anything remote to clean up in the first place.
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
