import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../hooks/useAuth';
import { useEntitlements } from '../hooks/useEntitlements';
import type { JournalEntry } from './journal';
import { listLocalJournalEntries } from './journalStore';

export const JOURNAL_ENTITLEMENT_KEY = 'journal';

interface JournalContextValue {
  entries: JournalEntry[];
  loading: boolean;
  error: string | null;
  isJournalEnabled: boolean;
  reloadJournal: () => Promise<void>;
}

const JournalContext = createContext<JournalContextValue | null>(null);

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const { isEnabled, loading: entitlementsLoading } = useEntitlements();
  const isJournalEnabled = isEnabled(JOURNAL_ENTITLEMENT_KEY);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reloadJournal = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!user || !isJournalEnabled) {
      setEntries([]);
      setError(null);
      setLoadingEntries(false);
      return;
    }

    setLoadingEntries(true);
    setError(null);
    try {
      const nextEntries = await listLocalJournalEntries({
        userId: user.id,
        startDate: null,
        endDate: null,
      });
      if (requestId === requestIdRef.current) {
        setEntries(nextEntries);
      }
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      console.warn('Journal refresh failed:', loadError);
      setError('Your Journal could not be loaded from this device.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingEntries(false);
      }
    }
  }, [isJournalEnabled, user]);

  useEffect(() => {
    reloadJournal();
  }, [reloadJournal]);

  const value = useMemo(
    () => ({
      entries,
      loading: initializing || entitlementsLoading || loadingEntries,
      error,
      isJournalEnabled,
      reloadJournal,
    }),
    [
      entries,
      entitlementsLoading,
      error,
      initializing,
      isJournalEnabled,
      loadingEntries,
      reloadJournal,
    ]
  );

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export { JournalContext };
