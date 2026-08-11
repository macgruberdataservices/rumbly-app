// Mirrors dataProvider.tsx/activityProvider.tsx's pattern of one provider
// owning fetch + state. Hydrates from AsyncStorage on mount (device-local,
// no account/auth dependency, so this can sit outside AuthProvider).

import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { Coordinates } from '../location/proximity';
import {
  loadAllAllergyInSearch,
  loadFindFeedContentMode,
  loadFindFeedEnabled,
  loadMockLocation,
  loadNativeInteractionsEnabled,
  loadShowAllergyFriendlyMenuItems,
  saveAllAllergyInSearch,
  saveAllergyAcknowledgement,
  saveFindFeedContentMode,
  saveFindFeedEnabled,
  saveMockLocation,
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
  mockLocation: Coordinates | null;
  setMockLocation: (value: Coordinates | null) => void;
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
  // true to match loadNativeInteractionsEnabled's new no-value-stored
  // default -- this is just what shows before that async load resolves.
  const [nativeInteractionsEnabled, setNativeInteractionsEnabledState] = useState(true);
  const [mockLocation, setMockLocationState] = useState<Coordinates | null>(null);
  const [isSettingsReady, setIsSettingsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadAllAllergyInSearch(),
      loadShowAllergyFriendlyMenuItems(),
      loadFindFeedEnabled(),
      loadFindFeedContentMode(),
      loadNativeInteractionsEnabled(),
      loadMockLocation(),
    ]).then(([allergy, showAllergyMenuItems, feed, contentMode, nativeInteractions, mockLoc]) => {
      if (cancelled) return;
      setAllAllergyInSearchState(allergy);
      setShowAllergyFriendlyMenuItemsState(showAllergyMenuItems);
      setFindFeedEnabledState(feed);
      setFindFeedContentModeState(contentMode);
      setNativeInteractionsEnabledState(nativeInteractions);
      setMockLocationState(mockLoc);
      setIsSettingsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // All seven setters are useCallback'd with empty deps -- each only calls a
  // state setter (stable) and a save function (module-level import), so a
  // stable identity is safe and keeps the memoized value below from churning.
  const setAllAllergyInSearch = useCallback((value: boolean) => {
    setAllAllergyInSearchState(value);
    saveAllAllergyInSearch(value).catch(() => {});
  }, []);

  const setShowAllergyFriendlyMenuItems = useCallback((value: boolean) => {
    setShowAllergyFriendlyMenuItemsState(value);
    saveShowAllergyFriendlyMenuItems(value).catch(() => {});
  }, []);

  const acknowledgeAllergyDisclaimer = useCallback(() => {
    setAllergyAcknowledgedThisSession(true);
    saveAllergyAcknowledgement().catch(() => {});
  }, []);

  const setFindFeedEnabled = useCallback((value: boolean) => {
    setFindFeedEnabledState(value);
    saveFindFeedEnabled(value).catch(() => {});
  }, []);

  const setFindFeedContentMode = useCallback((value: FindFeedContentMode) => {
    setFindFeedContentModeState(value);
    saveFindFeedContentMode(value).catch(() => {});
  }, []);

  const setNativeInteractionsEnabled = useCallback((value: boolean) => {
    setNativeInteractionsEnabledState(value);
    saveNativeInteractionsEnabled(value).catch(() => {});
  }, []);

  const setMockLocation = useCallback((value: Coordinates | null) => {
    setMockLocationState(value);
    saveMockLocation(value).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
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
      mockLocation,
      setMockLocation,
      isSettingsReady,
    }),
    [
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
      mockLocation,
      setMockLocation,
      isSettingsReady,
    ]
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export { AppSettingsContext };
