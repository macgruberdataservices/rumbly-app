// Fetch + local cache for user_entitlements rows. Cached per-user (not a
// single shared key) so switching accounts on one device can't leak the
// previous user's flags before the network refresh lands.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

type EntitlementMap = Record<string, boolean>;

function cacheKey(userId: string): string {
  return `rumbly.entitlements.${userId}`;
}

export async function loadCachedEntitlements(userId: string): Promise<EntitlementMap> {
  const raw = await AsyncStorage.getItem(cacheKey(userId));
  return raw ? JSON.parse(raw) : {};
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
    map[row.feature_key as string] = row.enabled as boolean;
  }
  await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(map));
  return map;
}
