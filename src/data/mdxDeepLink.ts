// Deep links into Disney's own "My Disney Experience" app (bundle id
// com.disney.MyDisneyExperience). Discovered 2026-07-27 via a live
// mitmproxy capture of the real app's own network traffic -- these are
// not guesses, they're lifted directly from Disney's own first-party
// config/content endpoints:
// - `mobileOrderDeepLink` in disneyworld.disney.go.com's own
//   /dine-res/api/app-config/ response
// - `dineConfigs.walkUp.sections.url` in that same site's
//   /dine-res/api/label-contents/static response
// - the generic restaurant-detail link (`finder/detail`) confirmed live
//   inside searchservice.wdprapps.disney.com's own search-suggestion
//   payloads (a "Mobile order burgers at Cosmic Ray's..." suggestion
//   carrying its own real deepLink.url)
//
// Disney's own site has no dedicated walk-up-list-for-one-restaurant
// link (that config key has no facilityId placeholder, unlike the
// mobile-order one) or reservation-specific link at all -- confirmed
// on-device: opening the general restaurant link and tapping the
// existing "Join Walk-Up List"/reservation controls from there is the
// real in-app flow, matching Disney's own analytics breadcrumbs
// (previous.page: "content/finder/detail" immediately preceding a
// JoinWalkUpList action). So reservations and walk-up both route to the
// same general restaurant link; only mobile order gets its own.
import { Linking, Platform } from 'react-native';
import type { Restaurant } from './types';

const MDX_SCHEME = 'mdx';

// raw_facets is Disney's raw internal marketing/filter metadata
// (deliberately excluded from the Related taxonomy per the 2026-07-19
// data spike, src/search/filters.ts's header comment) -- but mobile-order
// availability has no cleaner source in the published data, so this is a
// narrow, single-purpose exception, not a reversal of that decision.
export function hasMobileOrder(r: Restaurant): boolean {
  return r.raw_facets.some((f) => f.group === 'features' && f.id === 'mobile-orders');
}

// 26 of 436 published restaurants are hand-coded venues with a
// placeholder facility_id (e.g. "HANDCODE.001") standing in for a real
// Disney facility that doesn't exist -- those can never produce a
// working mdx:// link.
function hasRealFacilityId(r: Restaurant): boolean {
  return /^\d+$/.test(r.facility_id);
}

function restaurantDeepLink(facilityId: string): string {
  return `${MDX_SCHEME}://finder/detail?facilityId=${facilityId};entityType=restaurant`;
}

function mobileOrderDeepLink(facilityId: string): string {
  return `${MDX_SCHEME}://OPP/Mobile_Order_RestaurantDetails?facilityId=${facilityId};entityType=restaurant`;
}

// Falls back to disney_url in the browser when the mdx:// link can't be
// opened -- official app not installed (or not iOS, where this scheme
// was never verified), or a hand-coded restaurant with no real
// facility_id to link with in the first place. Never throws; a broken
// link should be a silent no-op, not a crash.
async function openWithFallback(mdxUrl: string | null, fallbackUrl: string | null): Promise<void> {
  if (mdxUrl && Platform.OS === 'ios') {
    try {
      if (await Linking.canOpenURL(mdxUrl)) {
        await Linking.openURL(mdxUrl);
        return;
      }
    } catch {
      // fall through to the browser fallback below
    }
  }
  if (fallbackUrl) {
    Linking.openURL(fallbackUrl).catch(() => {});
  }
}

// Reservations and walk-up both land on the restaurant's own page in the
// real app -- see this file's header comment for why there's no more
// specific link for either.
export function openRestaurantInOfficialApp(r: Restaurant): Promise<void> {
  return openWithFallback(hasRealFacilityId(r) ? restaurantDeepLink(r.facility_id) : null, r.disney_url);
}

export function openMobileOrderInOfficialApp(r: Restaurant): Promise<void> {
  return openWithFallback(hasRealFacilityId(r) ? mobileOrderDeepLink(r.facility_id) : null, r.disney_url);
}
