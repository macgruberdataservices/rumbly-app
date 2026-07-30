import { useAuth } from './useAuth';

// The Development menu is a personal test surface, not a real entitlement --
// gated to the owner's account directly rather than through Supabase
// user_entitlements (which would need a DB row and is no more secure, since
// entitlements are also just a client-side flag check).
const DEV_OWNER_EMAIL = 'jastoney@gmail.com';

export function useIsDevOwner(): boolean {
  const { user } = useAuth();
  return user?.email?.toLowerCase() === DEV_OWNER_EMAIL;
}
