// UI-independent Journal domain contracts. Database row mapping, local
// persistence, media processing, and sync behavior are intentionally left
// for later Journal phases.

export const MAX_JOURNAL_PHOTOS = 6;

// Photos are local-device-only storage (see Docs/JOURNAL_BUILD_PLAN.md) --
// nothing about them affects an entry's own sync state, so there is no
// 'pending_photos' step between the entry pushing and being fully synced.
export type JournalEntrySyncState =
  | 'draft'
  | 'pending_entry'
  | 'synced'
  | 'failed';

export type JournalPhotoSyncState = 'staged' | 'pending' | 'synced' | 'failed';

export interface JournalTargetSnapshot {
  restaurantId: string;
  itemId: string | null;
  restaurantNameSnapshot: string;
  itemNameSnapshot: string | null;
  // Visit context only. It must never be included in item identity.
  mealPeriodSnapshot: string | null;
}

export interface JournalEntry extends JournalTargetSnapshot {
  id: string;
  userId: string;
  // Shared with the one Got It event created for this visit.
  clientId: string;
  // Calendar date in YYYY-MM-DD form, independent of sync timestamps.
  visitedOn: string;
  note: string | null;
  syncState: JournalEntrySyncState;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface JournalPhoto {
  id: string;
  userId: string;
  entryId: string;
  position: number;
  localUri: string | null;
  localThumbnailUri: string | null;
  displayPath: string | null;
  thumbnailPath: string | null;
  width: number;
  height: number;
  displayBytes: number | null;
  thumbnailBytes: number | null;
  syncState: JournalPhotoSyncState;
  createdAt: string;
  deletedAt: string | null;
}

export interface StagedJournalPhoto {
  id: string;
  userId: string;
  draftId: string;
  position: number;
  displayUri: string;
  thumbnailUri: string;
  width: number;
  height: number;
  displayBytes: number;
  thumbnailBytes: number;
  createdAt: string;
}

export interface JournalStorageReport {
  photoBytes: number;
  photoCount: number;
}

export interface JournalEntryWithPhotos {
  entry: JournalEntry;
  photos: JournalPhoto[];
}

export interface JournalEntryDraft extends JournalTargetSnapshot {
  id: string;
  userId: string;
  clientId: string;
  visitedOn: string;
  note: string | null;
  rating: number | null;
  photoIds: string[];
  updatedAt: string;
}

export interface CreateJournalEntryInput extends JournalTargetSnapshot {
  id: string;
  userId: string;
  clientId: string;
  visitedOn: string;
  note: string | null;
  rating: number | null;
  photoIds: string[];
}

export interface UpdateJournalEntryInput {
  id: string;
  userId: string;
  visitedOn: string;
  mealPeriodSnapshot: string | null;
  note: string | null;
  rating: number | null;
  photoIds: string[];
}

export type JournalDeleteMode = 'journal_only' | 'journal_and_got_it';

export interface JournalDateRange {
  startDate: string | null;
  endDate: string | null;
}

export interface JournalEntryQuery extends JournalDateRange {
  userId: string;
  restaurantId?: string;
  itemId?: string | null;
  includeDeleted?: boolean;
}

// Photos never leave the device, so the outbox only ever queues entry-level
// operations now (see Docs/JOURNAL_BUILD_PLAN.md). The local journal_outbox
// table's schema still technically permits 'photo'/'photo_upsert'/
// 'photo_delete' values from before this change; the app just never writes
// them going forward.
export type JournalOutboxOperationType = 'entry_upsert' | 'entry_delete';

export type JournalOutboxState = 'pending' | 'processing' | 'failed';

export interface JournalOutboxOperation {
  operationKey: string;
  userId: string;
  entityType: 'entry';
  entityId: string;
  operationType: JournalOutboxOperationType;
  state: JournalOutboxState;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
