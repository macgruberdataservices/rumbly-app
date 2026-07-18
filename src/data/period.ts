// Ported from Disney Dining Dev's index.html PERIOD_ORDER, with one
// deliberate fix: the source app treats this list as a whitelist and
// silently drops any dining_period value not in it (documented bug,
// confirmed to affect ~33 restaurants there — e.g. a restaurant left with
// only an unrecognized period after filtering renders no tabs and no
// items at all, not just an unlabeled tab). This port never drops a
// period — sortKey() below buckets unrecognized values after all known
// ones instead, so nothing a restaurant actually serves can vanish.
export const PERIOD_ORDER = [
  'Breakfast',
  'Brunch',
  'Lunch',
  'Lunch And Dinner',
  'Dinner',
  'Late Night Dining',
  'All Day',
  'Lounge',
  'Bar – Lounge',
  'Pool Bar',
  'Pool Bar and Grill',
  'Coffee – Bakery',
  'Snack',
  'Special',
  'Special Ticketed Event',
] as const;

const ORDER_INDEX: Record<string, number> = Object.fromEntries(
  PERIOD_ORDER.map((p, i) => [p, i])
);

// Known periods sort by their PERIOD_ORDER position; anything unrecognized
// sorts after all of them (alphabetically among themselves), rather than
// being excluded from the result entirely.
export function sortKey(period: string): number {
  return ORDER_INDEX[period] ?? PERIOD_ORDER.length;
}

export function sortPeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => {
    const diff = sortKey(a) - sortKey(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
}

const REAL_MEAL_PERIODS = new Set(['Breakfast', 'Brunch', 'Lunch', 'Dinner']);

// Ported from showMenu()'s inline "All Day" suppression: if any real meal
// period (Breakfast/Brunch/Lunch/Dinner) is present, drop the "All Day"
// tab — it's redundant once a specific period exists. Unlike PERIOD_ORDER
// filtering above, this only ever removes "All Day", never a real period.
export function dropRedundantAllDay(periods: string[]): string[] {
  const hasReal = periods.some((p) => REAL_MEAL_PERIODS.has(p));
  if (!hasReal) return periods;
  return periods.filter((p) => p !== 'All Day');
}

// Ported from defaultPeriod(): picks the active tab by time of day,
// falling back to the first available period if the preferred slot isn't
// offered.
export function defaultPeriod(available: string[]): string | undefined {
  if (available.length === 0) return undefined;
  const hour = new Date().getHours();
  const preferred = hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : 'Dinner';
  return available.includes(preferred) ? preferred : available[0];
}
