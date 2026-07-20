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

export type SearchCategory = 'all' | 'items' | 'restaurants' | 'related';

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

export function useSearch(restaurants: Restaurant[]) {
  const [query, setQuery] = useState('');
  const [activeRelated, setActiveRelated] = useState<RelatedTag | null>(null);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
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
    isSearchActive: query.trim().length > 0,
    activeRelated,
    toggleRelated,
    activeCategory,
    setActiveCategory,
    clear,
  };
}
