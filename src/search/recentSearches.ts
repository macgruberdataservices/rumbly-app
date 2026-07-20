import { normalizeForSearch } from '../data/diacritics';
import { getDb } from '../data/sqlite';

const MAX_RECENT_SEARCHES = 8;

export interface RecentSearch {
  query: string;
  usedAt: number;
}

async function ensureTable(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS recent_searches (
      normalized_query TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      used_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recent_searches_used_at
      ON recent_searches(used_at DESC);
  `);
}

export async function loadRecentSearches(): Promise<RecentSearch[]> {
  await ensureTable();
  const db = await getDb();
  const rows = await db.getAllAsync<{ query: string; used_at: number }>(
    `SELECT query, used_at
     FROM recent_searches
     ORDER BY used_at DESC
     LIMIT $limit;`,
    { $limit: MAX_RECENT_SEARCHES }
  );
  return rows.map((row) => ({ query: row.query, usedAt: row.used_at }));
}

export async function recordRecentSearch(query: string): Promise<RecentSearch[]> {
  const trimmed = query.trim().replace(/\s+/g, ' ');
  const normalized = normalizeForSearch(trimmed);
  if (normalized.length < 2) return loadRecentSearches();

  await ensureTable();
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO recent_searches (normalized_query, query, used_at)
     VALUES ($normalized, $query, $used_at)
     ON CONFLICT(normalized_query) DO UPDATE SET
       query = excluded.query,
       used_at = excluded.used_at;`,
    { $normalized: normalized, $query: trimmed, $used_at: Date.now() }
  );
  await db.runAsync(
    `DELETE FROM recent_searches
     WHERE normalized_query NOT IN (
       SELECT normalized_query
       FROM recent_searches
       ORDER BY used_at DESC
       LIMIT $limit
     );`,
    { $limit: MAX_RECENT_SEARCHES }
  );
  return loadRecentSearches();
}

export async function clearRecentSearches(): Promise<void> {
  await ensureTable();
  const db = await getDb();
  await db.runAsync('DELETE FROM recent_searches;');
}
