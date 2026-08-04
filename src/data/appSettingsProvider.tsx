// Mirrors dataProvider.tsx/activityProvider.tsx's pattern of one provider
// owning fetch + state. Hydrates from AsyncStorage on mount (device-local,
// no account/auth dependency, so this can sit outside AuthProvider).

import React, { createContext, useEffect, useState } from 'react';
import {
  loadAllAllergyInSearch,
  loadFindFeedContentMode,
  loadFindFeedEnabled,
  loadNativeInteractionsEnabled,
  loadShowAllergyFriendlyMenuItems,
  saveAllAllergyInSearch,
  saveAllergyAcknowledgement,
  saveFindFeedContentMode,
  saveFindFeedEnabled,
  saveNativeInteractionsEnabled,
  saveShowAllergyFriendlyMenuItems,
  type FindFeedContentMode,
} from './appSettings';

interface AppSettingsContextValue {
  allAllergyInSearch: boolean;
  setAllAllergyInSearch: (value: boolean) => void;
  showAllergyFriendlyMenuItems: boolean;
  setShowAllergyFriendlyMenuItems: (value: boolean) => void;
  allergyAcknowledgedThisSession: boolean;
  acknowledgeAllergyDisclaimer: () => void;
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
  const [showAllergyFriendlyMenuItems, setShowAllergyFriendlyMenuItemsState] = useState(false);
  const [allergyAcknowledgedThisSession, setAllergyAcknowledgedThisSession] = useState(false);
  const [findFeedEnabled, setFindFeedEnabledState] = useState(true);
  const [findFeedContentMode, setFindFeedContentModeState] =
    useState<FindFeedContentMode>('live');
  const [nativeInteractionsEnabled, setNativeInteractionsEnabledState] = useState(false);
  const [isSettingsReady, setIsSettingsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadAllAllergyInSearch(),
      loadShowAllergyFriendlyMenuItems(),
      loadFindFeedEnabled(),
      loadFindFeedContentMode(),
      loadNativeInteractionsEnabled(),
    ]).then(([allergy, showAllergyMenuItems, feed, contentMode, nativeInteractions]) => {
      if (cancelled) return;
      setAllAllergyInSearchState(allergy);
      setShowAllergyFriendlyMenuItemsState(showAllergyMenuItems);
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

  const setShowAllergyFriendlyMenuItems = (value: boolean) => {
    setShowAllergyFriendlyMenuItemsState(value);
    saveShowAllergyFriendlyMenuItems(value).catch(() => {});
  };

  const acknowledgeAllergyDisclaimer = () => {
    setAllergyAcknowledgedThisSession(true);
    saveAllergyAcknowledgement().catch(() => {});
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
        showAllergyFriendlyMenuItems,
        setShowAllergyFriendlyMenuItems,
        allergyAcknowledgedThisSession,
        acknowledgeAllergyDisclaimer,
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
