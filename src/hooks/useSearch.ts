// Debounced live-search state for the Find tab. Mirrors dataProvider.tsx/
// activityProvider.tsx's pattern of one hook owning fetch + state, but
// deliberately isn't a context provider — search state is local to
// whichever screen mounts it (FindHomeScreen), not shared app-wide.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Restaurant, SearchIndexEntry } from '../data/types';
import { loadSearchIndex } from '../search/searchIndexLoader';
import { search as runSearch, type SearchResult } from '../search/rank';
import { restaurantHasRelatedTag, tagsEqual, type RelatedTag } from '../search/relatedTaxonomy';

// Matches the search spec's "150ms after input settles" performance
// target — short enough to feel live, long enough that fast typing
// doesn't re-run a full restaurant + 45k-item scan on every keystroke.
const DEBOUNCE_MS = 150;

export function useSearch(restaurants: Restaurant[]) {
  const [query, setQuery] = useState('');
  const [activeRelated, setActiveRelated] = useState<RelatedTag | null>(null);
  const [rawResults, setRawResults] = useState<SearchResult[]>([]);
  const [isIndexReady, setIsIndexReady] = useState(false);
  const searchIndexRef = useRef<SearchIndexEntry[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kicked off on first mount of whatever screen calls this hook — after
  // first paint, deliberately not joined to DataProvider's eager
  // restaurant/hours load (see searchIndexLoader.ts).
  useEffect(() => {
    let cancelled = false;
    loadSearchIndex().then((index) => {
      if (cancelled) return;
      searchIndexRef.current = index;
      setIsIndexReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setRawResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setRawResults(runSearch(query, restaurants, searchIndexRef.current));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // isIndexReady is a real dependency, not a lint-silencing placeholder:
    // a query typed before the index finishes loading needs to re-run
    // once it becomes available, or item results would silently stay
    // empty for that first search.
  }, [query, restaurants, isIndexReady]);

  const results = useMemo(() => {
    if (!activeRelated) return rawResults;
    return rawResults.filter((r) => {
      if (r.kind === 'restaurant') return restaurantHasRelatedTag(r.restaurant, activeRelated);
      if (r.kind === 'item') return !!r.restaurant && restaurantHasRelatedTag(r.restaurant, activeRelated);
      return true; // keep related rows visible so the active one can be toggled off
    });
  }, [rawResults, activeRelated]);

  const toggleRelated = useCallback((tag: RelatedTag) => {
    setActiveRelated((current) => (tagsEqual(current, tag) ? null : tag));
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setActiveRelated(null);
  }, []);

  return {
    query,
    setQuery,
    results,
    isSearchActive: query.trim().length > 0,
    activeRelated,
    toggleRelated,
    clear,
  };
}
