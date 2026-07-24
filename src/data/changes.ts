// Ported from Disney Dining Dev's Front_End/index.html "SEE CHANGES"
// section (search that file for "SEE CHANGES" for the original DOM-based
// version) -- same data contract, categorization, and grouping rules,
// reimplemented as React Navigation screens instead of a manual JS view
// stack (there's no DOM to diff here, and this project already has a
// native stack navigator for exactly this kind of drill-down).
//
// Scope trim vs. the original: the original's row taps pass an item
// *name* to a client-side name-match against the target menu (there's no
// item_id in the changes feed itself). Rumbly's RestaurantDetail route
// targets by item_id, and a name-based resolver would silently fail for
// menu_item_removed events anyway (the item's gone from current menu
// data) -- so taps here just open the restaurant, no attempt at
// item-level highlighting. Revisit if that's worth the fragility.
//
// Also not persisted offline (in-memory module cache only, like the
// original's CHANGES_MONTH_CACHE) -- Changes is inherently about *recent*
// data, so heavy offline caching matters less here than for the core
// restaurant/menu dataset. Could be added via fileStore.ts's pattern
// later if that turns out to matter.

import type { ChangeEvent, ChangesManifest } from './types';
import { CHANGES_MANIFEST_URL, DATA_BASE_URL } from './constants';

const monthCache = new Map<string, ChangeEvent[]>();

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function monthsInRange(from: string, to: string): string[] {
  const months: string[] = [];
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (d <= end) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return [...new Set(months)];
}

export async function loadChangesForRange(from: string, to: string): Promise<ChangeEvent[]> {
  const manifest = (await fetch(CHANGES_MANIFEST_URL).then((r) => r.json())) as ChangesManifest;
  const months = monthsInRange(from, to).filter((m) => manifest.months?.[m]);

  const fetches = months.map(async (m) => {
    const cached = monthCache.get(m);
    if (cached) return cached;
    const hashed = manifest.months[m];
    const data = (await fetch(`${DATA_BASE_URL}${hashed}`).then((r) => r.json())) as { events: ChangeEvent[] };
    monthCache.set(m, data.events);
    return data.events;
  });

  const events = (await Promise.all(fetches)).flat();
  return events.filter((e) => e.date >= from && e.date <= to);
}

export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export interface ChangeRowLine {
  name: string;
  sub: string;
}

// dining_period + menu_category together ("Breakfast" + "Sides") read as
// "the Sides section of the Breakfast menu" -- the same item can be
// added to more than one section (e.g. a regular menu and an
// Allergy-Friendly variant of the same meal period), which without this
// looked like duplicate, indistinguishable "Added" rows for the same
// item (found 2026-07-23: e.g. Ale and Compass's "Bacon" added to both
// Breakfast/Sides and Breakfast/Allergy-Friendly Sides on different
// days -- both rows read as plain "Added · $5.50" with no way to tell
// them apart). Null when the feed doesn't carry one or both fields, in
// which case the caller falls back to the old plain "Added" wording.
function menuSectionPhrase(e: ChangeEvent): string | null {
  const parts = [e.dining_period, e.menu_category].filter(Boolean);
  return parts.length > 0 ? `Added to ${parts.join(' ')}` : null;
}

// hideRestaurant: drop the restaurant name from the sub-label when the
// surrounding screen already names the restaurant once (a restaurant-
// scoped category view) -- repeating it on every row is noise.
export function changeRowLine(e: ChangeEvent, opts: { hideRestaurant?: boolean } = {}): ChangeRowLine {
  const hideR = !!opts.hideRestaurant;
  switch (e.category) {
    case 'restaurant_added':
      return { name: e.restaurant ?? '(unknown)', sub: 'New — tap to see the menu' };
    case 'restaurant_closed':
      return { name: e.restaurant ?? '(unknown)', sub: 'Appears to have closed' };
    case 'menu_item_added': {
      const section = menuSectionPhrase(e);
      const pricePart = e.price ? ` · ${e.price}` : '';
      const sub = hideR
        ? `${section ?? 'Added'}${pricePart}`
        : section
          ? `${section} at ${e.restaurant ?? ''}${pricePart}`
          : `Added at ${e.restaurant ?? ''}${pricePart}`;
      return { name: e.item ?? '(unnamed item)', sub };
    }
    case 'menu_item_removed':
      return {
        name: e.item ?? '(unnamed item)',
        sub: hideR
          ? e.last_price
            ? `Removed · was ${e.last_price}`
            : 'Removed'
          : `Removed from ${e.restaurant ?? ''}${e.last_price ? ` · was ${e.last_price}` : ''}`,
      };
    case 'price_change': {
      const priceLine = `$${(e.old_price ?? 0).toFixed(2)} → $${(e.new_price ?? 0).toFixed(2)}`;
      // A handful of price_change events carry no item name (a real gap
      // in the upstream fetcher's item-name capture, not a display bug)
      // -- fall back to the restaurant as the headline instead of a
      // blank name.
      if (hideR) return e.item ? { name: e.item, sub: priceLine } : { name: 'Price updated', sub: priceLine };
      return e.item
        ? { name: e.item, sub: `${e.restaurant ?? ''} · ${priceLine}` }
        : { name: e.restaurant ?? '(unknown)', sub: `Price updated · ${priceLine}` };
    }
    default:
      return { name: e.restaurant ?? e.item ?? 'Change', sub: '' };
  }
}

export interface EventGroup {
  key: string;
  heading: string;
  events: ChangeEvent[];
}

export type GroupMode = 'day' | 'week';

export function groupEvents(events: ChangeEvent[], groupMode: GroupMode): EventGroup[] {
  const groups = new Map<string, ChangeEvent[]>();
  for (const e of events) {
    const key = groupMode === 'day' ? e.date : mondayOf(e.date);
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a));
  return sortedKeys.map((key) => ({
    key,
    heading: groupMode === 'day' ? formatDateLabel(key) : `Week of ${formatDateLabel(key)}`,
    events: groups.get(key)!,
  }));
}

export interface RestaurantChangeGroup {
  restaurantId: string | null;
  restaurantName: string;
  events: ChangeEvent[];
  lastDate: string;
}

export function groupEventsByRestaurant(events: ChangeEvent[]): RestaurantChangeGroup[] {
  const map = new Map<string, RestaurantChangeGroup>();
  for (const e of events) {
    const key = e.restaurant_id || `name:${e.restaurant ?? ''}`;
    let g = map.get(key);
    if (!g) {
      g = { restaurantId: e.restaurant_id, restaurantName: e.restaurant ?? '(unknown)', events: [], lastDate: '' };
      map.set(key, g);
    }
    g.events.push(e);
    if (e.date > g.lastDate) g.lastDate = e.date;
  }
  return [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

export function restaurantSummaryLine(events: ChangeEvent[]): string {
  const menu = events.filter((e) => e.category === 'menu_item_added' || e.category === 'menu_item_removed').length;
  const price = events.filter((e) => e.category === 'price_change').length;
  const parts: string[] = [];
  if (menu) parts.push(`${menu} menu change${menu === 1 ? '' : 's'}`);
  if (price) parts.push(`${price} price change${price === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export interface CategoryGroup {
  key: 'menu' | 'price';
  label: string;
  icon: string;
  events: ChangeEvent[];
}

export function categoryBreakdown(events: ChangeEvent[]): CategoryGroup[] {
  const menu = events.filter((e) => e.category === 'menu_item_added' || e.category === 'menu_item_removed');
  const price = events.filter((e) => e.category === 'price_change');
  const out: CategoryGroup[] = [];
  if (menu.length) out.push({ key: 'menu', label: 'Menu Changes', icon: '🍽️', events: menu });
  if (price.length) out.push({ key: 'price', label: 'Price Changes', icon: '💲', events: price });
  return out;
}

export function isRowTappable(e: ChangeEvent): boolean {
  return !!e.restaurant_id && e.category !== 'restaurant_closed';
}
