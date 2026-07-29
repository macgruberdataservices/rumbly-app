// The small async SQLite surface used by schema/repository code. Keeping
// this interface free of Expo runtime imports lets the same persistence
// logic run against an in-memory SQLite adapter in Node regression tests.

export type SqlParameters = Record<string, string | number | null>;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqlParameters): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, params?: SqlParameters): Promise<T | null>;
  getAllAsync<T>(source: string, params?: SqlParameters): Promise<T[]>;
}

export function asSqlDatabase(db: SQLiteDatabase): SqlDatabase {
  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, params = {}) => db.runAsync(source, params),
    getFirstAsync: <T>(source: string, params: SqlParameters = {}) =>
      db.getFirstAsync<T>(source, params),
    getAllAsync: <T>(source: string, params: SqlParameters = {}) =>
      db.getAllAsync<T>(source, params),
  };
}
import type { SQLiteDatabase } from 'expo-sqlite';
