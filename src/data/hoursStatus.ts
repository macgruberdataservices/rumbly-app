// Computes today's open/closed status for a restaurant from HoursData.
// Uses HoursData.days[0] as "today" rather than a client-computed date
// string — the 8-day rolling window always starts today, and comparing
// against a locally-computed date risks a timezone mismatch against the
// pipeline's generation timezone. Reusable by Milestone 6's "Open Now"
// filter — built once here, not duplicated there.

import type { HoursData } from './types';

export type HoursStatusKind = 'open' | 'closed' | 'refurbishment' | 'unknown';

export interface HoursStatus {
  kind: HoursStatusKind;
  label: string;
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
    return { kind: 'unknown', label: 'Hours unavailable offline' };
  }

  const today = hoursData.days[0];
  const day = hoursData.restaurants[restaurantId]?.[today];

  if (!day) {
    return { kind: 'unknown', label: 'Hours unavailable offline' };
  }

  if ('refurbishment_flag' in day && day.refurbishment_flag) {
    return { kind: 'refurbishment', label: 'Temporarily closed for refurbishment' };
  }

  if ('closed_flag' in day && day.closed_flag) {
    return { kind: 'closed', label: 'Closed today' };
  }

  // Open day: has real `open`/`close` strings.
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const openMinutes = minutesSinceMidnight(day.open);
  const closeMinutes = minutesSinceMidnight(day.close);

  if (nowMinutes < openMinutes) {
    return { kind: 'closed', label: `Closed · Opens at ${to12Hour(day.open)}` };
  }
  if (nowMinutes >= closeMinutes) {
    return { kind: 'closed', label: 'Closed for the day' };
  }
  return { kind: 'open', label: `Open until ${to12Hour(day.close)}` };
}
