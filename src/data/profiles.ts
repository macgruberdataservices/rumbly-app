import { supabase } from './supabaseClient';

export interface UserProfile {
  firstName: string;
  lastName: string;
  nickname: string;
}

interface ProfileRow {
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}

export const EMPTY_PROFILE: UserProfile = {
  firstName: '',
  lastName: '',
  nickname: '',
};

export async function loadUserProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('first_name,last_name,nickname')
    .eq('user_id', userId)
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  if (!data) return EMPTY_PROFILE;

  return {
    firstName: data.first_name ?? '',
    lastName: data.last_name ?? '',
    nickname: data.nickname ?? '',
  };
}

export async function saveUserProfile(userId: string, profile: UserProfile): Promise<void> {
  const nullable = (value: string) => value.trim() || null;
  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: userId,
      first_name: nullable(profile.firstName),
      last_name: nullable(profile.lastName),
      nickname: nullable(profile.nickname),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) throw error;
}
