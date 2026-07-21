// Loads user_entitlements once per signed-in session: hydrates from the
// local cache first (so a flag check works offline immediately), then
// refreshes from Supabase. Signed-out users get an empty map -- entitlements
// are account-scoped by design, there's no anonymous/local variant of a
// feature gate the way Love It has a local-only mode.

import React, { createContext, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { fetchEntitlements, loadCachedEntitlements } from './entitlements';

interface EntitlementsContextValue {
  isEnabled: (featureKey: string) => boolean;
  loading: boolean;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

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
    setLoading(true);

    loadCachedEntitlements(user.id).then((cached) => {
      if (!cancelled) {
        setFlags(cached);
      }
    });

    fetchEntitlements(user.id).then((fresh) => {
      if (!cancelled) {
        setFlags(fresh);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const isEnabled = (featureKey: string) => flags[featureKey] === true;

  return (
    <EntitlementsContext.Provider value={{ isEnabled, loading }}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export { EntitlementsContext };
