// Debounced live-search state for the Find tab. Mirrors dataProvider.tsx/
// activityProvider.tsx's pattern of one hook owning fetch + state, but
// deliberately isn't a context provider — search state is local to
// whichever screen mounts it (FindHomeScreen), not shared app-wide.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Restaurant, SearchIndexEntry } from '../data/types';
import { loadSearchIndex } from '../search/searchIndexLoader';
import { search as runSearch, type SearchResult } from '../search/rank';
import { restaurantHasRelatedTag, tagsEqual, type RelatedTag } from '../search/relatedTaxonomy';
import type { SearchCategory } from '../search/findState';

// Matches the search spec's "150ms after input settles" performance
// target — short enough to feel live, long enough that fast typing
// doesn't re-run a full restaurant + 45k-item scan on every keystroke.
const DEBOUNCE_MS = 150;
const MIN_QUERY_LENGTH = 2;

export interface CategoryCounts {
  all: number;
  items: number;
  restaurants: number;
  related: number;
}

function countByCategory(results: SearchResult[]): CategoryCounts {
  const counts: CategoryCounts = { all: results.length, items: 0, restaurants: 0, related: 0 };
  for (const r of results) {
    if (r.kind === 'item') counts.items++;
    else if (r.kind === 'restaurant') counts.restaurants++;
    else counts.related++;
  }
  return counts;
}

export function useSearch(
  restaurants: Restaurant[],
  initialState?: { query: string; activeRelated: RelatedTag | null; activeCategory: SearchCategory },
  // Passed as useDataProvider()'s lastSyncedAt. The search index load
  // effect below only ran once on mount before this existed, so
  // invalidateSearchIndexCache() (called by DataProvider.forceRefresh()
  // after a real data change) had nothing left to re-trigger a reload --
  // the stale in-memory index just sat in searchIndexRef until the whole
  // app remounted. Including lastSyncedAt in that effect's deps makes a
  // completed refresh (forced or the normal 24h check) re-call
  // loadSearchIndex(), which picks up the fresh cache. Harmless no-op
  // when a refresh found nothing new -- the module cache wasn't
  // invalidated in that case, so loadSearchIndex() just resolves the
  // same already-cached promise again.
  lastSyncedAt?: number | null
) {
  const [query, setQuery] = useState(initialState?.query ?? '');
  const [activeRelated, setActiveRelated] = useState<RelatedTag | null>(initialState?.activeRelated ?? null);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>(initialState?.activeCategory ?? 'all');
  const [rawResults, setRawResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isIndexReady, setIsIndexReady] = useState(false);
  const searchIndexRef = useRef<SearchIndexEntry[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimmedQuery = query.trim();
  const isSearchActive = trimmedQuery.length >= MIN_QUERY_LENGTH;

  // Kicked off on first mount of whatever screen calls this hook — after
  // first paint, deliberately not joined to DataProvider's eager
  // restaurant/hours load (see searchIndexLoader.ts). Also re-runs on a
  // completed data refresh (lastSyncedAt change) -- see the lastSyncedAt
  // param comment above for why that's required, not just a mount-time
  // optimization.
  useEffect(() => {
    let cancelled = false;
    setIsIndexReady(false);
    loadSearchIndex().then((index) => {
      if (cancelled) return;
      searchIndexRef.current = index;
      setIsIndexReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [lastSyncedAt]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isSearchActive) {
      setRawResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(() => {
      setRawResults(runSearch(query, restaurants, searchIndexRef.current));
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // isIndexReady is a real dependency, not a lint-silencing placeholder:
    // a query typed before the index finishes loading needs to re-run
    // once it becomes available, or item results would silently stay
    // empty for that first search.
  }, [query, restaurants, isIndexReady, isSearchActive]);

  // Related-tag narrowing happens before category counts/filtering — a
  // count of "8 items" under an active Related tag should reflect the
  // narrowed set, not the full unfiltered one.
  const relatedFiltered = useMemo(() => {
    if (!activeRelated) return rawResults;
    return rawResults.filter((r) => {
      if (r.kind === 'restaurant') return restaurantHasRelatedTag(r.restaurant, activeRelated);
      if (r.kind === 'item') return restaurantHasRelatedTag(r.restaurant, activeRelated);
      return true; // keep related rows visible so the active one can be toggled off
    });
  }, [rawResults, activeRelated]);

  const counts = useMemo(() => countByCategory(relatedFiltered), [relatedFiltered]);

  const results = useMemo(() => {
    if (activeCategory === 'all') return relatedFiltered;
    const kind = activeCategory === 'items' ? 'item' : activeCategory === 'restaurants' ? 'restaurant' : 'related';
    return relatedFiltered.filter((r) => r.kind === kind);
  }, [relatedFiltered, activeCategory]);

  const toggleRelated = useCallback((tag: RelatedTag) => {
    setActiveRelated((current) => (tagsEqual(current, tag) ? null : tag));
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setActiveRelated(null);
    setActiveCategory('all');
  }, []);

  return {
    query,
    setQuery,
    results,
    counts,
    isSearchActive,
    isSearching,
    activeRelated,
    toggleRelated,
    activeCategory,
    setActiveCategory,
    clear,
  };
}
