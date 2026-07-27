// Mirrors dataProvider.tsx/activityProvider.tsx's pattern of one provider
// owning fetch + state. Hydrates from AsyncStorage on mount (device-local,
// no account/auth dependency, so this can sit outside AuthProvider).

import React, { createContext, useEffect, useState } from 'react';
import {
  loadAllAllergyInSearch,
  loadFindFeedEnabled,
  saveAllAllergyInSearch,
  saveFindFeedEnabled,
} from './appSettings';

interface AppSettingsContextValue {
  allAllergyInSearch: boolean;
  setAllAllergyInSearch: (value: boolean) => void;
  findFeedEnabled: boolean;
  setFindFeedEnabled: (value: boolean) => void;
  isSettingsReady: boolean;
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [allAllergyInSearch, setAllAllergyInSearchState] = useState(false);
  const [findFeedEnabled, setFindFeedEnabledState] = useState(true);
  const [isSettingsReady, setIsSettingsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadAllAllergyInSearch(), loadFindFeedEnabled()]).then(([allergy, feed]) => {
      if (cancelled) return;
      setAllAllergyInSearchState(allergy);
      setFindFeedEnabledState(feed);
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

  return (
    <AppSettingsContext.Provider
      value={{
        allAllergyInSearch,
        setAllAllergyInSearch,
        findFeedEnabled,
        setFindFeedEnabled,
        isSettingsReady,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export { AppSettingsContext };
