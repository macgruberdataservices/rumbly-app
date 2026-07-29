import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../hooks/useAuth';
import { useActivity } from '../hooks/useActivity';
import { useEntitlements } from '../hooks/useEntitlements';
import type {
  CreateJournalEntryInput,
  JournalDeleteMode,
  JournalEntry,
  JournalEntryDraft,
  UpdateJournalEntryInput,
} from './journal';
import {
  createLocalJournalEntry,
  deleteLocalJournalDraft,
  deleteLocalJournalEntry,
  getLatestLocalJournalDraft,
  listLocalJournalEntries,
  saveLocalJournalDraft,
  updateLocalJournalEntry,
} from './journalStore';

export const JOURNAL_ENTITLEMENT_KEY = 'journal';

interface JournalContextValue {
  entries: JournalEntry[];
  latestDraft: JournalEntryDraft | null;
  loading: boolean;
  error: string | null;
  isJournalEnabled: boolean;
  reloadJournal: () => Promise<void>;
  saveDraft: (draft: JournalEntryDraft) => Promise<void>;
  discardDraft: (draftId: string) => Promise<void>;
  createEntry: (input: CreateJournalEntryInput) => Promise<JournalEntry>;
  updateEntry: (input: UpdateJournalEntryInput) => Promise<JournalEntry>;
  deleteEntry: (entryId: string, mode: JournalDeleteMode) => Promise<boolean>;
}

const JournalContext = createContext<JournalContextValue | null>(null);

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const { reloadActivity } = useActivity();
  const { isEnabled, loading: entitlementsLoading } = useEntitlements();
  const isJournalEnabled = isEnabled(JOURNAL_ENTITLEMENT_KEY);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [latestDraft, setLatestDraft] = useState<JournalEntryDraft | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reloadJournal = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!user || !isJournalEnabled) {
      setEntries([]);
      setLatestDraft(null);
      setError(null);
      setLoadingEntries(false);
      return;
    }

    setLoadingEntries(true);
    setError(null);
    try {
      const [nextEntries, nextDraft] = await Promise.all([
        listLocalJournalEntries({
          userId: user.id,
          startDate: null,
          endDate: null,
        }),
        getLatestLocalJournalDraft(user.id),
      ]);
      if (requestId === requestIdRef.current) {
        setEntries(nextEntries);
        setLatestDraft(nextDraft);
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

  const saveDraft = useCallback(async (draft: JournalEntryDraft) => {
    await saveLocalJournalDraft(draft);
    setLatestDraft(draft);
  }, []);

  const discardDraft = useCallback(
    async (draftId: string) => {
      if (!user) return;
      await deleteLocalJournalDraft(user.id, draftId);
      setLatestDraft((current) => (current?.id === draftId ? null : current));
    },
    [user]
  );

  const refreshAfterEntryWrite = useCallback(async () => {
    await Promise.all([reloadJournal(), reloadActivity()]);
  }, [reloadActivity, reloadJournal]);

  const createEntry = useCallback(
    async (input: CreateJournalEntryInput) => {
      const result = await createLocalJournalEntry(input);
      await refreshAfterEntryWrite();
      return result.entry;
    },
    [refreshAfterEntryWrite]
  );

  const updateEntry = useCallback(
    async (input: UpdateJournalEntryInput) => {
      const result = await updateLocalJournalEntry(input);
      await deleteLocalJournalDraft(input.userId, input.id);
      await refreshAfterEntryWrite();
      return result;
    },
    [refreshAfterEntryWrite]
  );

  const deleteEntry = useCallback(
    async (entryId: string, mode: JournalDeleteMode) => {
      if (!user) return false;
      const deleted = await deleteLocalJournalEntry(user.id, entryId, mode);
      await deleteLocalJournalDraft(user.id, entryId);
      await refreshAfterEntryWrite();
      return deleted;
    },
    [refreshAfterEntryWrite, user]
  );

  useEffect(() => {
    reloadJournal();
  }, [reloadJournal]);

  const value = useMemo(
    () => ({
      entries,
      latestDraft,
      loading: initializing || entitlementsLoading || loadingEntries,
      error,
      isJournalEnabled,
      reloadJournal,
      saveDraft,
      discardDraft,
      createEntry,
      updateEntry,
      deleteEntry,
    }),
    [
      entries,
      latestDraft,
      entitlementsLoading,
      error,
      initializing,
      isJournalEnabled,
      loadingEntries,
      reloadJournal,
      saveDraft,
      discardDraft,
      createEntry,
      updateEntry,
      deleteEntry,
    ]
  );

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export { JournalContext };
