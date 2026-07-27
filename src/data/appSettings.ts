// Device-local app preferences -- unlike entitlements.ts, these are
// display/behavior preferences, not account-scoped feature gates, so
// there's a single unkeyed AsyncStorage entry rather than one per user.

import AsyncStorage from '@react-native-async-storage/async-storage';

const ALL_ALLERGY_IN_SEARCH_KEY = 'rumbly.settings.allAllergyInSearch';

// Default off (2026-07-27 owner decision): Disney's allergy-labeled rows
// are ~22% of all published items and would otherwise overwhelm
// unfiltered search results. See src/search/filters.ts's
// itemVisibleInSearch() for how this flag is actually applied.
export async function loadAllAllergyInSearch(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(ALL_ALLERGY_IN_SEARCH_KEY);
  return raw === 'true';
}

export async function saveAllAllergyInSearch(value: boolean): Promise<void> {
  await AsyncStorage.setItem(ALL_ALLERGY_IN_SEARCH_KEY, value ? 'true' : 'false');
}
