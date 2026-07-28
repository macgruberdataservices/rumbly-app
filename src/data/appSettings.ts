// Device-local app preferences -- unlike entitlements.ts, these are
// display/behavior preferences, not account-scoped feature gates, so
// there's a single unkeyed AsyncStorage entry rather than one per user.

import AsyncStorage from '@react-native-async-storage/async-storage';

const ALL_ALLERGY_IN_SEARCH_KEY = 'rumbly.settings.allAllergyInSearch';
const FIND_FEED_ENABLED_KEY = 'rumbly.settings.findFeedEnabled';
const FIND_FEED_CONTENT_MODE_KEY = 'rumbly.settings.findFeedContentMode';

export type FindFeedContentMode = 'live' | 'preview';

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

// The feed is a core Find experience, so it defaults on. Saving only an
// explicit false keeps existing installs opted in without a migration.
export async function loadFindFeedEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(FIND_FEED_ENABLED_KEY);
  return raw !== 'false';
}

export async function saveFindFeedEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(FIND_FEED_ENABLED_KEY, value ? 'true' : 'false');
}

// Administrator preview is intentionally device-local. It defaults to the
// production view so an administrator sees normal-user behavior unless they
// explicitly opt into reviewing unpublished content on this device.
export async function loadFindFeedContentMode(): Promise<FindFeedContentMode> {
  const raw = await AsyncStorage.getItem(FIND_FEED_CONTENT_MODE_KEY);
  return raw === 'preview' ? 'preview' : 'live';
}

export async function saveFindFeedContentMode(value: FindFeedContentMode): Promise<void> {
  await AsyncStorage.setItem(FIND_FEED_CONTENT_MODE_KEY, value);
}
