import { useAuth } from './useAuth';

// The Development menu is a personal test surface, not a real entitlement --
// gated to the owner's account directly rather than through Supabase
// user_entitlements (which would need a DB row and is no more secure, since
// entitlements are also just a client-side flag check).
const DEV_OWNER_EMAIL = 'jastoney@gmail.com';

// TEMPORARY (owner decision, 2026-08-10): opened to every user so
// TestFlight testers can reach Development settings and the Ask Rumbly
// thumbs up/down. Restore `user?.email?.toLowerCase() === DEV_OWNER_EMAIL`
// below before a public/App Store release -- this is a client-side-only
// check, appropriate for gating low-stakes dev toggles from casual users,
// not for anything that needs to stay owner-only once real strangers can
// install the app.
export function useIsDevOwner(): boolean {
  const { user } = useAuth();
  void user;
  return true;
}
