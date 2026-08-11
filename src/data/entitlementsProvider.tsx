// Loads user_entitlements once per signed-in session: hydrates from the
// local cache first (so a flag check works offline immediately), then
// refreshes from Supabase. Signed-out users get an empty map -- entitlements
// are account-scoped by design, there's no anonymous/local variant of a
// feature gate the way Love It has a local-only mode.

import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { fetchEntitlements, loadCachedEntitlements } from './entitlements';

interface EntitlementsContextValue {
  isEnabled: (featureKey: string) => boolean;
  loading: boolean;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

// TEMPORARY (owner decision, 2026-08-10): these five default ON for any
// signed-in user with no explicit user_entitlements row, so TestFlight
// testers get the real features without needing a Supabase row created
// per account. An explicit row (true OR false) still wins either way --
// this only changes the no-row fallback. content_admin (unpublished-
// content preview) is deliberately excluded -- stays a real per-account
// grant, not something testers should see by default. Still nothing for
// signed-out users (unchanged) -- entitlements remain account-scoped.
// Revisit whether this stays default-on once testing settles down, or
// gets replaced with real per-account rows.
// Module-level: this never varies per render, and reallocating the Set on
// every render was pure garbage for the collector.
const DEFAULT_ON_FEATURES = new Set(['got_it', 'journal', 'need_it', 'rating_averages', 'ratings']);

// A signed-in launch sets flags twice -- once from the local cache, then again
// from Supabase -- and the two are identical almost every time, since flags
// change rarely. Each set produced a new object and therefore a new isEnabled
// identity, and FindFeed memoizes the entire feed build on isEntitled. Device
// measurement caught this directly: feed.build reported n=2 on every launch,
// so the whole feed was built twice per launch for no change in input.
//
// Keeping the previous reference when the flags match collapses that back to
// one build. Flag maps hold a handful of keys, so the comparison is trivial
// against a build that was measured at ~350ms on device.
function sameFlags(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setFlags({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Never carry one account's cached feature flags through an account
    // switch while the next account's cache and remote flags are loading.
    setFlags({});
    setLoading(true);

    // Both paths keep the previous reference when the flags are unchanged --
    // see sameFlags. The remote result arriving identical to the cached one is
    // the normal case, and it must not look like a change to consumers.
    loadCachedEntitlements(user.id).then((cached) => {
      if (!cancelled) {
        setFlags((previous) => (sameFlags(previous, cached) ? previous : cached));
      }
    });

    fetchEntitlements(user.id).then((fresh) => {
      if (!cancelled) {
        setFlags((previous) => (sameFlags(previous, fresh) ? previous : fresh));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isEnabled = useCallback(
    (featureKey: string) => {
      if (!user) return false;
      if (featureKey in flags) return flags[featureKey] === true;
      return DEFAULT_ON_FEATURES.has(featureKey);
    },
    [flags, user]
  );

  // Memoized so consumers only re-render when flags/loading actually change.
  // A fresh object (and a fresh isEnabled closure) on every render made every
  // screen reading useEntitlements re-render on any unrelated provider update.
  const value = useMemo(() => ({ isEnabled, loading }), [isEnabled, loading]);

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export { EntitlementsContext };
