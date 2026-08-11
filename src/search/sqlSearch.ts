// PARKED, 2026-08-11. Complete, tested, and deliberately unreferenced.
//
// This works and is proven equivalent to the in-memory path against the real
// 31k dataset (tests/sqlSearch.test.mjs). It is not wired up because on its
// own it buys almost nothing, and that is worth understanding before picking
// it back up.
//
// The prize was supposed to be the ~390ms JSON.parse of search_index.json on
// every cold launch, plus the ~31MB it retains. But useSearch is only one of
// five callers of loadSearchIndex(). FindFeed is another, and Find is the
// default tab -- so the parse still happens on every launch and the array
// stays resident regardless of where search gets its candidates. Switching
// search to SQL changes query latency (in an unmeasured direction, since it
// adds a bridge crossing the in-memory path does not have) and nothing else.
//
// What would unblock it: FindFeed sourcing its candidates from SQLite too.
// That is not a straight swap -- buildFindFeed scans the whole item set to
// score, and marshalling ~25k rows across the bridge could cost as much as
// the parse it replaces, so the rails would need their filters pushed into
// SQL. MyActivityScreen, JournalComposerScreen and AskRumblyScreen also read
// the index, but they are on-demand screens, so they pay the parse when
// opened rather than at launch. AskRumblyScreen already loads
// getAllMenuItems() from SQLite alongside it.
//
// If tests/sqlSearch.test.mjs ever fails because rank.ts changed and this did
// not: that is the intended alarm, not a nuisance. Either update this to
// match, or delete both files -- do not weaken the test to keep parked code
// green.
//
// See Docs/SEARCH_PERFORMANCE.md in the parent repo for the measurements.
//
// ---
//
// The SQL-backed search path, running alongside the in-memory one.
//
// Deliberately calls rank.ts's search() unmodified. Nothing about tiers,
// ordering, the localeCompare tie-break, dedupe or MAX_RESULTS moves here --
// this only changes where the candidate items come from. That is what makes
// the two paths comparable: given the same candidates, it is literally the
// same function producing the answer, so a differential test over real data
// is a proof rather than a spot check.

import type { Restaurant, SearchIndexEntry } from '../data/types';
import type { SqlDatabase } from '../data/sqlDatabase';
import { normalizeForSearch } from '../data/diacritics';
import { FUZZY_TRIGGER_RESULT_COUNT, search, type SearchResult } from './rank';
import { findFuzzyItemEntries, findStrictItemEntries } from './menuItemQuery';

// rank.ts gates item-level fuzzy matching on fuzzyNameMatch(norm, q, 5), so a
// query shorter than this can never produce a fuzzy item match and the second
// query is pure waste.
const MIN_FUZZY_QUERY_LENGTH = 5;

// Mirrors fuzzyNameMatch's own threshold.
function maxEditDistance(query: string): number {
  return query.length >= 7 ? 2 : 1;
}

function unionByIdentity(
  strict: SearchIndexEntry[],
  fuzzy: SearchIndexEntry[]
): SearchIndexEntry[] {
  const seen = new Set(strict.map((item) => `${item.restaurant_id}:${item.item_id}`));
  const merged = strict.slice();
  for (const item of fuzzy) {
    const key = `${item.restaurant_id}:${item.item_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

export interface SqlSearchOutcome {
  results: SearchResult[];
  // True when the second, wider query was needed. Reported because it is the
  // expensive path and the one worth watching on device -- see
  // Docs/SEARCH_PERFORMANCE.md on precise queries being the slow ones.
  usedFuzzyPass: boolean;
  strictCandidateCount: number;
  fuzzyCandidateCount: number;
}

// Two phases, and the gate between them is sound rather than heuristic.
//
// Running search() against strict-only candidates cannot produce a wrong
// answer when the fuzzy fallback stays shut, and it cannot silently produce a
// wrong one when the fallback opens either -- because over a strict-only
// array the item fuzzy pass adds nothing at all. Every strict match is already
// in rank.ts's seenItemKeys and gets skipped, and every non-match fails the
// same visibility check it failed the first time. So the returned length is
// exactly the value rank.ts tested its gate against, which makes
// `results.length < FUZZY_TRIGGER_RESULT_COUNT` a reliable signal that the
// wider candidate set is actually required.
//
// That matters for cost: broad queries, which are the common case and already
// return plenty, never pay for the second query. Only precise or misspelled
// queries do -- and those are the ones the fallback exists for.
export async function searchViaSql(
  db: SqlDatabase,
  query: string,
  restaurants: Restaurant[],
  dietary: Set<string> = new Set(),
  allowAllergyByDefault: boolean = false
): Promise<SqlSearchOutcome> {
  const normalized = normalizeForSearch(query).trim();
  if (!normalized) {
    return { results: [], usedFuzzyPass: false, strictCandidateCount: 0, fuzzyCandidateCount: 0 };
  }

  const strict = await findStrictItemEntries(db, normalized);
  const firstPass = search(query, restaurants, strict, dietary, allowAllergyByDefault);

  const fuzzyPossible = normalized.length >= MIN_FUZZY_QUERY_LENGTH;
  if (!fuzzyPossible || firstPass.length >= FUZZY_TRIGGER_RESULT_COUNT) {
    return {
      results: firstPass,
      usedFuzzyPass: false,
      strictCandidateCount: strict.length,
      fuzzyCandidateCount: 0,
    };
  }

  // The fallback would have run, so it needs candidates the strict query
  // never selected. The union is passed rather than the fuzzy set alone: the
  // strict pass has to see its own matches too, and rank.ts makes one pass
  // over one array.
  const fuzzy = await findFuzzyItemEntries(db, normalized, maxEditDistance(normalized));
  const merged = unionByIdentity(strict, fuzzy);
  return {
    results: search(query, restaurants, merged, dietary, allowAllergyByDefault),
    usedFuzzyPass: true,
    strictCandidateCount: strict.length,
    fuzzyCandidateCount: fuzzy.length,
  };
}
