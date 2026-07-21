// Fetch + local cache for user_entitlements rows. Cached per-user (not a
// single shared key) so switching accounts on one device can't leak the
// previous user's flags before the network refresh lands.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

type EntitlementMap = Record<string, boolean>;

function normalizeEntitlements(map: EntitlementMap): EntitlementMap {
  if (map.want_to_try === undefined) return map;
  const { want_to_try, ...rest } = map;
  return { ...rest, need_it: rest.need_it ?? want_to_try };
}

function cacheKey(userId: string): string {
  return `rumbly.entitlements.${userId}`;
}

export async function loadCachedEntitlements(userId: string): Promise<EntitlementMap> {
  const raw = await AsyncStorage.getItem(cacheKey(userId));
  return raw ? normalizeEntitlements(JSON.parse(raw)) : {};
}

export async function fetchEntitlements(userId: string): Promise<EntitlementMap> {
  const { data, error } = await supabase
    .from('user_entitlements')
    .select('feature_key, enabled')
    .eq('user_id', userId);

  if (error) {
    console.warn('fetchEntitlements failed:', error.message);
    return {};
  }
  if (!data) {
    return {};
  }

  const map: EntitlementMap = {};
  for (const row of data) {
    const featureKey = row.feature_key === 'want_to_try' ? 'need_it' : (row.feature_key as string);
    map[featureKey] = map[featureKey] === true || (row.enabled as boolean);
  }
  await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(map));
  return map;
}
