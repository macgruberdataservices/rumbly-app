import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureActivitySchema } from './activitySql';
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
} from './journal';
import {
  createJournalEntryRecord,
  countJournalPhotoRecords,
  deleteStagedJournalPhotoRecord,
  deleteJournalDraftRecord,
  deleteJournalEntryRecord,
  failJournalOutboxOperationRecord,
  getJournalDraftRecord,
  getLatestJournalDraftRecord,
  getJournalEntryRecord,
  listJournalEntryRecords,
  listJournalOutboxRecords,
  listJournalPhotoRecords,
  listStagedJournalPhotoRecords,
  removeJournalOutboxOperationRecord,
  saveJournalDraftRecord,
  saveStagedJournalPhotoRecord,
  setJournalEntrySyncStateRecord,
  updateJournalEntryRecord,
  type CreateJournalEntryResult,
} from './journalRepository';
import { ensureJournalSchema } from './journalSchema';
import { getDb as getSharedDb } from './sqlite';
import { asSqlDatabase } from './sqlDatabase';

let readyPromise: Promise<SQLiteDatabase> | null = null;

function getJournalDb(): Promise<SQLiteDatabase> {
  if (!readyPromise) {
    readyPromise = getSharedDb().then(async (db) => {
      const sqlDb = asSqlDatabase(db);
      await ensureActivitySchema(sqlDb);
      await ensureJournalSchema(sqlDb);
      return db;
    });
  }
  return readyPromise;
}

export async function createLocalJournalEntry(
  input: CreateJournalEntryInput
): Promise<CreateJournalEntryResult> {
  const db = await getJournalDb();
  let result: CreateJournalEntryResult | null = null;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    result = await createJournalEntryRecord(
      asSqlDatabase(transaction),
      input,
      new Date().toISOString()
    );
  });
  if (!result) throw new Error('Journal entry transaction did not complete.');
  return result;
}

export async function updateLocalJournalEntry(
  input: UpdateJournalEntryInput
): Promise<JournalEntry> {
  const db = await getJournalDb();
  let result: JournalEntry | null = null;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    result = await updateJournalEntryRecord(
      asSqlDatabase(transaction),
      input,
      new Date().toISOString()
    );
  });
  if (!result) throw new Error('Journal update transaction did not complete.');
  return result;
}

export async function deleteLocalJournalEntry(
  userId: string,
  entryId: string,
  mode: JournalDeleteMode
): Promise<boolean> {
  const db = await getJournalDb();
  let deleted = false;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    deleted = await deleteJournalEntryRecord(
      asSqlDatabase(transaction),
      userId,
      entryId,
      mode,
      new Date().toISOString()
    );
  });
  return deleted;
}

export async function getLocalJournalEntry(
  userId: string,
  entryId: string,
  includeDeleted = false
): Promise<JournalEntry | null> {
  const db = await getJournalDb();
  return getJournalEntryRecord(asSqlDatabase(db), userId, entryId, includeDeleted);
}

export async function listLocalJournalEntries(
  query: JournalEntryQuery
): Promise<JournalEntry[]> {
  const db = await getJournalDb();
  return listJournalEntryRecords(asSqlDatabase(db), query);
}

export async function listLocalJournalPhotos(
  userId: string,
  entryId?: string
): Promise<JournalPhoto[]> {
  const db = await getJournalDb();
  return listJournalPhotoRecords(asSqlDatabase(db), userId, entryId);
}

export async function saveLocalJournalDraft(draft: JournalEntryDraft): Promise<void> {
  const db = await getJournalDb();
  await saveJournalDraftRecord(asSqlDatabase(db), draft);
}

export async function getLocalJournalDraft(
  userId: string,
  draftId: string
): Promise<JournalEntryDraft | null> {
  const db = await getJournalDb();
  return getJournalDraftRecord(asSqlDatabase(db), userId, draftId);
}

export async function getLatestLocalJournalDraft(
  userId: string
): Promise<JournalEntryDraft | null> {
  const db = await getJournalDb();
  return getLatestJournalDraftRecord(asSqlDatabase(db), userId);
}

export async function deleteLocalJournalDraft(
  userId: string,
  draftId: string
): Promise<boolean> {
  const db = await getJournalDb();
  return deleteJournalDraftRecord(asSqlDatabase(db), userId, draftId);
}

export async function saveLocalStagedJournalPhoto(
  photo: StagedJournalPhoto
): Promise<void> {
  const db = await getJournalDb();
  await saveStagedJournalPhotoRecord(asSqlDatabase(db), photo);
}

export async function listLocalStagedJournalPhotos(
  userId: string,
  draftId: string
): Promise<StagedJournalPhoto[]> {
  const db = await getJournalDb();
  return listStagedJournalPhotoRecords(asSqlDatabase(db), userId, draftId);
}

export async function deleteLocalStagedJournalPhoto(
  userId: string,
  photoId: string
): Promise<boolean> {
  const db = await getJournalDb();
  return deleteStagedJournalPhotoRecord(asSqlDatabase(db), userId, photoId);
}

export async function countLocalJournalPhotos(userId: string): Promise<number> {
  const db = await getJournalDb();
  return countJournalPhotoRecords(asSqlDatabase(db), userId);
}

export async function listLocalJournalOutbox(
  userId: string
): Promise<JournalOutboxOperation[]> {
  const db = await getJournalDb();
  return listJournalOutboxRecords(asSqlDatabase(db), userId);
}

export async function setLocalJournalEntrySyncState(
  userId: string,
  entryId: string,
  syncState: JournalEntry['syncState']
): Promise<void> {
  const db = await getJournalDb();
  await setJournalEntrySyncStateRecord(asSqlDatabase(db), userId, entryId, syncState);
}

export async function removeLocalJournalOutboxOperation(operationKey: string): Promise<void> {
  const db = await getJournalDb();
  await removeJournalOutboxOperationRecord(asSqlDatabase(db), operationKey);
}

export async function failLocalJournalOutboxOperation(
  operationKey: string,
  errorMessage: string
): Promise<void> {
  const db = await getJournalDb();
  await failJournalOutboxOperationRecord(
    asSqlDatabase(db),
    operationKey,
    errorMessage,
    new Date().toISOString()
  );
}
