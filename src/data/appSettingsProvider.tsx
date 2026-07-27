// Mirrors dataProvider.tsx/activityProvider.tsx's pattern of one provider
// owning fetch + state. Hydrates from AsyncStorage on mount (device-local,
// no account/auth dependency, so this can sit outside AuthProvider).

import React, { createContext, useEffect, useState } from 'react';
import { loadAllAllergyInSearch, saveAllAllergyInSearch } from './appSettings';

interface AppSettingsContextValue {
  allAllergyInSearch: boolean;
  setAllAllergyInSearch: (value: boolean) => void;
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [allAllergyInSearch, setAllAllergyInSearchState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAllAllergyInSearch().then((value) => {
      if (!cancelled) setAllAllergyInSearchState(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAllAllergyInSearch = (value: boolean) => {
    setAllAllergyInSearchState(value);
    saveAllAllergyInSearch(value).catch(() => {});
  };

  return (
    <AppSettingsContext.Provider value={{ allAllergyInSearch, setAllAllergyInSearch }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export { AppSettingsContext };
