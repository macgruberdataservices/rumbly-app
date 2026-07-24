// Computes today's open/closed status for a restaurant from HoursData.
// Uses HoursData.days[0] as "today" rather than a client-computed date
// string — the 8-day rolling window always starts today, and comparing
// against a locally-computed date risks a timezone mismatch against the
// pipeline's generation timezone. Reusable by Milestone 6's "Open Now"
// filter — built once here, not duplicated there.

import type { HoursData } from './types';

// 'unknown' is a genuine offline/not-loaded-yet condition (hoursData
// itself is missing). 'none' is different and permanent: hoursData
// loaded fine, this restaurant just has no entry in it -- true for every
// hand-coded venue (no real Disney facility id, so nothing ever fetches
// hours for it). Kept distinct so callers can render nothing for 'none'
// instead of an "unavailable offline" message that isn't accurate for a
// restaurant that will never have published hours in the first place.
export type HoursStatusKind = 'open' | 'closed' | 'refurbishment' | 'unknown' | 'none';

export interface HoursStatus {
  kind: HoursStatusKind;
  // Short live-status label for list rows, e.g. "Open till 9:00 PM" / "Opens at 9:00 AM".
  label: string;
  // Full schedule label for the restaurant page and preview popup, e.g. "Open today 9:00 AM - 9:00 PM".
  todayLabel: string;
}

function to12Hour(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${suffix}`;
}

function minutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export function getTodayStatus(hoursData: HoursData | null, restaurantId: string): HoursStatus {
  if (!hoursData) {
    return { kind: 'unknown', label: 'Hours unavailable offline', todayLabel: 'Hours unavailable offline' };
  }

  const today = hoursData.days[0];
  const day = hoursData.restaurants[restaurantId]?.[today];

  if (!day) {
    return { kind: 'none', label: '', todayLabel: '' };
  }

  if ('refurbishment_flag' in day && day.refurbishment_flag) {
    return {
      kind: 'refurbishment',
      label: 'Temporarily closed for refurbishment',
      todayLabel: 'Temporarily closed for refurbishment',
    };
  }

  if ('closed_flag' in day && day.closed_flag) {
    return { kind: 'closed', label: 'Closed today', todayLabel: 'Closed today' };
  }

  // Open day: has real `open`/`close` strings.
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const openMinutes = minutesSinceMidnight(day.open);
  const closeMinutes = minutesSinceMidnight(day.close);
  const todayLabel = `Open today ${to12Hour(day.open)} - ${to12Hour(day.close)}`;

  if (nowMinutes < openMinutes) {
    return { kind: 'closed', label: `Opens at ${to12Hour(day.open)}`, todayLabel };
  }
  if (nowMinutes >= closeMinutes) {
    // Distinct from the closed_flag case above ("Closed today" -- didn't
    // open at all today) -- this restaurant DID have hours today, they've
    // just already ended (found 2026-07-23: The Friars Nook read "Closed
    // today" well after its actual closing time, reading like it never
    // opened rather than like it just wrapped up for the day).
    return { kind: 'closed', label: 'Now Closed', todayLabel };
  }
  return { kind: 'open', label: `Open till ${to12Hour(day.close)}`, todayLabel };
}
