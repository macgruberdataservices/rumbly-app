// Device-local app preferences -- unlike entitlements.ts, these are
// display/behavior preferences, not account-scoped feature gates, so
// there's a single unkeyed AsyncStorage entry rather than one per user.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALLERGY_ACKNOWLEDGEMENT_VERSION } from './allergyPolicy';
import type { Coordinates } from '../location/proximity';

const ALL_ALLERGY_IN_SEARCH_KEY = 'rumbly.settings.allAllergyInSearch';
const SHOW_ALLERGY_FRIENDLY_MENU_ITEMS_KEY = 'rumbly.settings.showAllergyFriendlyMenuItems';
const FIND_FEED_ENABLED_KEY = 'rumbly.settings.findFeedEnabled';
const FIND_FEED_CONTENT_MODE_KEY = 'rumbly.settings.findFeedContentMode';
const NATIVE_INTERACTIONS_ENABLED_KEY = 'rumbly.settings.nativeInteractionsEnabled';
const MOCK_LOCATION_KEY = 'rumbly.settings.mockLocation';
const ALLERGY_ACKNOWLEDGEMENT_KEY = 'rumbly.safety.allergyAcknowledgement';

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

// Default ON (corrected 2026-08-06 -- was defaulting off, which silently
// contradicted this comment's own description of the intended behavior
// below, and guaranteed an empty menu for the one restaurant this setting
// actually matters for). Disney's allergy-labeled rows are normally
// suppressed as dupes of a visible base item (see normalize_menu.py), so
// this setting has no effect on almost every restaurant -- confirmed
// against the live data 2026-08-06, exactly one restaurant currently has
// any show_in_menu:true item that's also is_allergy_friendly:true. It only
// matters for the rare restaurant whose entire menu IS allergy-friendly
// categories with no base items of its own (e.g. "Allergy-Friendly
// Offerings at Mickey's Not-So-Scary Halloween Party", found 2026-08-04)
// -- normalize_menu.py's unsuppress_allergy_only_restaurants() leaves
// those show_in_menu:true rather than showing an empty menu, and this
// setting is what lets someone who doesn't want to see them hide them
// again -- which only works as a hide-them-again escape hatch if the
// default is to show them in the first place. See src/search/filters.ts's
// itemVisibleInMenu().
export async function loadShowAllergyFriendlyMenuItems(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(SHOW_ALLERGY_FRIENDLY_MENU_ITEMS_KEY);
  return raw !== 'false';
}

export async function saveShowAllergyFriendlyMenuItems(value: boolean): Promise<void> {
  await AsyncStorage.setItem(SHOW_ALLERGY_FRIENDLY_MENU_ITEMS_KEY, value ? 'true' : 'false');
}

export async function saveAllergyAcknowledgement(): Promise<void> {
  await AsyncStorage.setItem(
    ALLERGY_ACKNOWLEDGEMENT_KEY,
    JSON.stringify({
      version: ALLERGY_ACKNOWLEDGEMENT_VERSION,
      acknowledgedAt: new Date().toISOString(),
    })
  );
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

// Expo UI migration safety switch. Classic stays the default until each
// native surface has passed device QA; every converted component must retain
// its classic implementation while this pilot is active.
export async function loadNativeInteractionsEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(NATIVE_INTERACTIONS_ENABLED_KEY);
  return raw === 'true';
}

export async function saveNativeInteractionsEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(NATIVE_INTERACTIONS_ENABLED_KEY, value ? 'true' : 'false');
}

// Developer-only fake GPS coordinate (Development settings, owner account
// only -- see useIsDevOwner.ts). When set, useNearMe short-circuits real
// GPS entirely, so every proximity consumer (Find Feed's nearby rails,
// walking distances, search's "near me" sort/grouping) transparently sees
// this coordinate instead. Persisted so it survives an app restart while
// testing a specific park location.
export async function loadMockLocation(): Promise<Coordinates | null> {
  const raw = await AsyncStorage.getItem(MOCK_LOCATION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Coordinates>;
    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      return { latitude: parsed.latitude, longitude: parsed.longitude };
    }
  } catch {
    // Corrupt value -- treat as unset rather than throwing on every app launch.
  }
  return null;
}

export async function saveMockLocation(value: Coordinates | null): Promise<void> {
  if (value) {
    await AsyncStorage.setItem(MOCK_LOCATION_KEY, JSON.stringify(value));
  } else {
    await AsyncStorage.removeItem(MOCK_LOCATION_KEY);
  }
}
