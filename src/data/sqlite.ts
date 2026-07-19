// The single shared expo-sqlite connection, opened once and reused by
// every module that needs SQLite (db.ts's menu_items, activity.ts's
// activity log). Schema ownership stays per-module — this file only
// opens the connection.

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { SQLITE_DB_NAME } from './constants';

let dbPromise: Promise<SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(SQLITE_DB_NAME);
  }
  return dbPromise;
}
