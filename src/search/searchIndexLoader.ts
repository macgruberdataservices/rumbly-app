// Lazy loader for search_index.json. `search_index.json` is written by
// importPipeline.ts but was write-only until Milestone 5 — nothing ever
// read it back. Deliberately a separate module-level promise cache from
// DataProvider's eager restaurant/hours load: parsing the full item-name
// index shouldn't block the 1.5s cold-launch-to-usable-search budget for
// the default Find state, which doesn't need it. The first caller to
// import a hook that actually needs search (useSearch, mounted from the
// Find tab) kicks off the fetch after first paint.

import type { SearchIndexEntry } from '../data/types';
import { LOCAL_FILES } from '../data/constants';
import { readJSON } from '../data/fileStore';

let cached: Promise<SearchIndexEntry[]> | null = null;

export function loadSearchIndex(): Promise<SearchIndexEntry[]> {
  if (!cached) {
    cached = readJSON<SearchIndexEntry[]>(LOCAL_FILES.searchIndex).then((data) => data ?? []);
  }
  return cached;
}

// A data refresh (runImport) overwrites search_index.json on disk — call
// this right after so the next search reads the fresh file instead of a
// stale in-memory copy from before the refresh.
export function invalidateSearchIndexCache(): void {
  cached = null;
}
