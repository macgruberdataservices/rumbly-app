import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { useAuth } from '../hooks/useAuth';
import { useActivity } from '../hooks/useActivity';
import { useEntitlements } from '../hooks/useEntitlements';
import type {
  CreateJournalEntryInput,
  JournalDeleteMode,
  JournalEntry,
  JournalEntryDraft,
  JournalPhoto,
  UpdateJournalEntryInput,
} from './journal';
import {
  createLocalJournalEntry,
  deleteLocalJournalDraft,
  deleteLocalJournalEntry,
  getLatestLocalJournalDraft,
  listLocalJournalEntries,
  listLocalJournalOutbox,
  listLocalJournalPhotos,
  saveLocalJournalDraft,
  updateLocalJournalEntry,
} from './journalStore';
import { syncJournal } from './journalSync';

export const JOURNAL_ENTITLEMENT_KEY = 'journal';

interface JournalContextValue {
  entries: JournalEntry[];
  photos: JournalPhoto[];
  latestDraft: JournalEntryDraft | null;
  loading: boolean;
  error: string | null;
  isJournalEnabled: boolean;
  failedSyncCount: number;
  reloadJournal: () => Promise<void>;
  saveDraft: (draft: JournalEntryDraft) => Promise<void>;
  discardDraft: (draftId: string) => Promise<void>;
  createEntry: (input: CreateJournalEntryInput) => Promise<JournalEntry>;
  updateEntry: (input: UpdateJournalEntryInput) => Promise<JournalEntry>;
  deleteEntry: (entryId: string, mode: JournalDeleteMode) => Promise<boolean>;
  retrySync: () => Promise<void>;
}

const JournalContext = createContext<JournalContextValue | null>(null);

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const { reloadActivity } = useActivity();
  const { isEnabled, loading: entitlementsLoading } = useEntitlements();
  const isJournalEnabled = isEnabled(JOURNAL_ENTITLEMENT_KEY);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [photos, setPhotos] = useState<JournalPhoto[]>([]);
  const [latestDraft, setLatestDraft] = useState<JournalEntryDraft | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const requestIdRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const reloadJournal = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!user || !isJournalEnabled) {
      setEntries([]);
      setPhotos([]);
      setLatestDraft(null);
      setError(null);
      setLoadingEntries(false);
      return;
    }

    setLoadingEntries(true);
    setError(null);
    try {
      const [nextEntries, nextDraft, nextPhotos] = await Promise.all([
        listLocalJournalEntries({
          userId: user.id,
          startDate: null,
          endDate: null,
        }),
        getLatestLocalJournalDraft(user.id),
        listLocalJournalPhotos(user.id),
      ]);
      if (requestId === requestIdRef.current) {
        setEntries(nextEntries);
        setLatestDraft(nextDraft);
        setPhotos(nextPhotos);
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

  const refreshSyncStatus = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) {
      setFailedSyncCount(0);
      return;
    }
    try {
      const outbox = await listLocalJournalOutbox(userId);
      setFailedSyncCount(outbox.filter((operation) => operation.state === 'failed').length);
    } catch (statusError) {
      console.warn('Journal sync status failed to load:', statusError);
    }
  }, []);

  // Fire-and-forget by design -- matches useActivity's own sync trigger.
  // Journal is local-first: creating, editing, or deleting an entry must
  // return immediately regardless of connectivity, never block on upload.
  const runSync = useCallback(() => {
    const userId = userIdRef.current;
    if (!userId) return;
    syncJournal(userId)
      .then(() => Promise.all([reloadJournal(), refreshSyncStatus()]))
      .catch((syncError) => console.warn('Journal sync failed:', syncError));
  }, [reloadJournal, refreshSyncStatus]);

  const retrySync = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    await syncJournal(userId);
    await Promise.all([reloadJournal(), refreshSyncStatus()]);
  }, [reloadJournal, refreshSyncStatus]);

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
      setLatestDraft((current) => (current?.id === input.id ? null : current));
      await refreshAfterEntryWrite();
      runSync();
      return result.entry;
    },
    [refreshAfterEntryWrite, runSync]
  );

  const updateEntry = useCallback(
    async (input: UpdateJournalEntryInput) => {
      const result = await updateLocalJournalEntry(input);
      await deleteLocalJournalDraft(input.userId, input.id);
      await refreshAfterEntryWrite();
      runSync();
      return result;
    },
    [refreshAfterEntryWrite, runSync]
  );

  const deleteEntry = useCallback(
    async (entryId: string, mode: JournalDeleteMode) => {
      if (!user) return false;
      const deleted = await deleteLocalJournalEntry(user.id, entryId, mode);
      await deleteLocalJournalDraft(user.id, entryId);
      await refreshAfterEntryWrite();
      runSync();
      return deleted;
    },
    [refreshAfterEntryWrite, runSync, user]
  );

  useEffect(() => {
    reloadJournal();
  }, [reloadJournal]);

  // Sign-in / session restoration: pulls the sync engine forward once per
  // sign-in so anything left in the outbox from a prior offline session
  // (or a retry that only now has a valid session to authenticate with)
  // gets a chance to drain, mirroring useActivity's own sign-in sync.
  useEffect(() => {
    if (!user || !isJournalEnabled) return;
    runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isJournalEnabled]);

  // App foreground: a park visitor is far more likely to have connectivity
  // (or a session) return while backgrounded than while actively looking
  // at the screen, so returning to the app is the highest-value moment to
  // retry beyond the trigger points above.
  useEffect(() => {
    const previous = { current: AppState.currentState };
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (previous.current !== 'active' && next === 'active') runSync();
      previous.current = next;
    });
    return () => subscription.remove();
  }, [runSync]);

  // Connectivity restoration: the outbox otherwise only gets another
  // chance on the next foreground, sign-in, or local write, which could be
  // a while for someone who saved several offline entries in one sitting.
  useEffect(() => {
    const previous = { current: true };
    const subscription = Network.addNetworkStateListener((state) => {
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;
      if (!previous.current && isOnline) runSync();
      previous.current = isOnline;
    });
    return () => subscription.remove();
  }, [runSync]);

  const value = useMemo(
    () => ({
      entries,
      photos,
      latestDraft,
      loading: initializing || entitlementsLoading || loadingEntries,
      error,
      isJournalEnabled,
      failedSyncCount,
      reloadJournal,
      saveDraft,
      discardDraft,
      createEntry,
      updateEntry,
      deleteEntry,
      retrySync,
    }),
    [
      entries,
      photos,
      latestDraft,
      entitlementsLoading,
      error,
      failedSyncCount,
      initializing,
      isJournalEnabled,
      loadingEntries,
      reloadJournal,
      saveDraft,
      discardDraft,
      createEntry,
      updateEntry,
      deleteEntry,
      retrySync,
    ]
  );

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export { JournalContext };
