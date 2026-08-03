import { useCallback } from 'react';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { AppRootStackParamList } from '../navigation/journalTypes';

// The settings button is persistent across Find, Explore, and My Rumbly
// (2026-08-02). Settings now lives as its own navigator on the root
// AppStack (see SettingsNavigator.tsx) rather than nested inside My
// Rumbly's stack -- navigate() bubbles up to whichever ancestor
// navigator owns the target route, same idiom useJournalComposer already
// relies on, so this works unchanged no matter which tab it's called
// from and never touches the tab navigator's own state.
export function useOpenAccountSettings() {
  const navigation = useNavigation<NavigationProp<AppRootStackParamList>>();

  return useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);
}
