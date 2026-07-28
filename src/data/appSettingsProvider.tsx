// Mirrors dataProvider.tsx/activityProvider.tsx's pattern of one provider
// owning fetch + state. Hydrates from AsyncStorage on mount (device-local,
// no account/auth dependency, so this can sit outside AuthProvider).

import React, { createContext, useEffect, useState } from 'react';
import {
  loadAllAllergyInSearch,
  loadFindFeedContentMode,
  loadFindFeedEnabled,
  loadNativeInteractionsEnabled,
  saveAllAllergyInSearch,
  saveFindFeedContentMode,
  saveFindFeedEnabled,
  saveNativeInteractionsEnabled,
  type FindFeedContentMode,
} from './appSettings';

interface AppSettingsContextValue {
  allAllergyInSearch: boolean;
  setAllAllergyInSearch: (value: boolean) => void;
  findFeedEnabled: boolean;
  setFindFeedEnabled: (value: boolean) => void;
  findFeedContentMode: FindFeedContentMode;
  setFindFeedContentMode: (value: FindFeedContentMode) => void;
  nativeInteractionsEnabled: boolean;
  setNativeInteractionsEnabled: (value: boolean) => void;
  isSettingsReady: boolean;
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [allAllergyInSearch, setAllAllergyInSearchState] = useState(false);
  const [findFeedEnabled, setFindFeedEnabledState] = useState(true);
  const [findFeedContentMode, setFindFeedContentModeState] =
    useState<FindFeedContentMode>('live');
  const [nativeInteractionsEnabled, setNativeInteractionsEnabledState] = useState(false);
  const [isSettingsReady, setIsSettingsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadAllAllergyInSearch(),
      loadFindFeedEnabled(),
      loadFindFeedContentMode(),
      loadNativeInteractionsEnabled(),
    ]).then(([allergy, feed, contentMode, nativeInteractions]) => {
      if (cancelled) return;
      setAllAllergyInSearchState(allergy);
      setFindFeedEnabledState(feed);
      setFindFeedContentModeState(contentMode);
      setNativeInteractionsEnabledState(nativeInteractions);
      setIsSettingsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAllAllergyInSearch = (value: boolean) => {
    setAllAllergyInSearchState(value);
    saveAllAllergyInSearch(value).catch(() => {});
  };

  const setFindFeedEnabled = (value: boolean) => {
    setFindFeedEnabledState(value);
    saveFindFeedEnabled(value).catch(() => {});
  };

  const setFindFeedContentMode = (value: FindFeedContentMode) => {
    setFindFeedContentModeState(value);
    saveFindFeedContentMode(value).catch(() => {});
  };

  const setNativeInteractionsEnabled = (value: boolean) => {
    setNativeInteractionsEnabledState(value);
    saveNativeInteractionsEnabled(value).catch(() => {});
  };

  return (
    <AppSettingsContext.Provider
      value={{
        allAllergyInSearch,
        setAllAllergyInSearch,
        findFeedEnabled,
        setFindFeedEnabled,
        findFeedContentMode,
        setFindFeedContentMode,
        nativeInteractionsEnabled,
        setNativeInteractionsEnabled,
        isSettingsReady,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export { AppSettingsContext };
