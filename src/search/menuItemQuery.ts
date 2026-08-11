// SQL candidate retrieval for item search.
//
// This is deliberately only the RETRIEVAL half of the port. Tier assignment,
// scoring, ordering, dedupe and result caps all stay in rank.ts, untouched,
// operating on whatever this returns. Reimplementing rank.ts's nine tiers and
// its localeCompare tie-break in SQL would be faster and is not worth it: a
// subtle ordering difference is a user-visible regression in the app's most
// important feature, and ranking is not where the time goes. The time goes in
// the 380ms JSON.parse this replaces.
//
// No Expo imports here -- it takes a SqlDatabase, so the queries run against
// an in-memory SQLite in Node tests with the real 31k-row dataset.

import type { SqlDatabase } from './../data/sqlDatabase.ts';

// The projection ranking needs, and nothing more.
//
// Two-phase on purpose. A broad query legitimately matches thousands of rows
// (`ch` matches 5,387), and every one has to be ranked before the top 200 can
// be known -- taking a SQL LIMIT would change which 200 survive. So phase one
// pulls this narrow shape for every match, and phase two hydrates only the
// survivors into full entries. That bounds the expensive bridge marshalling
// to the rows actually displayed, without touching what gets displayed.
export interface MenuItemCandidateRow {
  restaurant_id: string;
  item_id: string;
  item: string;
  norm_item: string;
  show_in_menu: number;
  is_kids: number;
  is_allergy_friendly: number;
  allergens: string;
}

const CANDIDATE_COLUMNS =
  'restaurant_id, item_id, item, norm_item, show_in_menu, is_kids, is_allergy_friendly, allergens';

// One scan, not three.
//
// rank.ts's strict item tiers are, in order: norm === q, norm.startsWith(q),
// norm.includes(q). The first two are special cases of the third, so every
// row any strict tier can match is a row where q appears as a substring.
// instr() retrieves exactly that set and rank.ts still decides which tier each
// row lands in -- no tier logic moves into SQL.
//
// instr cannot seek, so this is a scan. It is a scan of the covering index
// rather than the 30-column table (see menuItemsSchema.ts), executed in C
// over ~31k rows, against a JSON.parse of the whole index plus a JS loop.
export async function findStrictItemCandidates(
  db: SqlDatabase,
  normalizedQuery: string
): Promise<MenuItemCandidateRow[]> {
  if (!normalizedQuery) return [];
  return db.getAllAsync<MenuItemCandidateRow>(
    `SELECT ${CANDIDATE_COLUMNS} FROM menu_items WHERE instr(norm_item, $q) > 0;`,
    { $q: normalizedQuery }
  );
}

// Splits a query into k+1 chunks of as even a length as possible.
//
// The evenness matters far more than it looks. By the pigeonhole principle,
// any string within edit distance k of the query must contain at least one of
// k+1 disjoint chunks verbatim -- k edits cannot touch k+1 chunks -- so
// matching on chunks is a sound necessary condition with no false negatives.
// But a naive ceil() split of a 7-character query gives 3/3/1, and that
// 1-character chunk matches ~73% of the index, making the filter useless.
// Measured on the real dataset: "churros" as chu|rro|s selects 73.8% of rows,
// and as chu|rr|os selects 9.9%.
export function pigeonholeChunks(query: string, maxDistance: number): string[] {
  const count = maxDistance + 1;
  if (query.length < count) return [query];
  const base = Math.floor(query.length / count);
  const remainder = query.length % count;
  const chunks: string[] = [];
  let at = 0;
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    chunks.push(query.slice(at, at + size));
    at += size;
  }
  return chunks;
}

// Candidates for the fuzzy fallback.
//
// Returns a superset of what rank.ts's edit-distance check will accept --
// containing a chunk does not imply being within edit distance -- so the
// caller must still run the existing fuzzyNameMatch over these. That is the
// point: the expensive per-item edit distance now runs over ~1-15% of the
// index instead of all of it, and the cheap substring test runs in C.
export async function findFuzzyItemCandidates(
  db: SqlDatabase,
  normalizedQuery: string,
  maxDistance: number
): Promise<MenuItemCandidateRow[]> {
  const chunks = pigeonholeChunks(normalizedQuery, maxDistance).filter(Boolean);
  if (chunks.length === 0) return [];
  const params: Record<string, string> = {};
  const predicates = chunks.map((chunk, index) => {
    const key = `$c${index}`;
    params[key] = chunk;
    return `instr(norm_item, ${key}) > 0`;
  });
  return db.getAllAsync<MenuItemCandidateRow>(
    `SELECT ${CANDIDATE_COLUMNS} FROM menu_items WHERE ${predicates.join(' OR ')};`,
    params
  );
}
