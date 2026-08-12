// When Rumbly first saw a menu row.
//
// Lives here rather than in the executor because both the executor and the
// result proof need it, and the proof already imports from the executor's
// module for nothing else. Reaching back the other way for this one function
// created a require cycle, which Metro warns about and which can leave one
// module holding an uninitialized binding depending on which side loads first.
//
// Pure and React-Native safe, like the rest of src/askRumbly.

import type { MenuItem } from '../data/types';
import type { AskRumblyData } from './dataTypes';

/**
 * Rumbly's own collection start, derived from the data rather than configured.
 *
 * Every row imported on that first day has an unknown true age -- Rumbly
 * cannot see before its own birth -- so those rows are never "new". Once the
 * collection start falls outside the rolling window this stops mattering and
 * the window alone decides, which is how the answer sharpens as the app's
 * history lengthens.
 */
const collectionStartCache = new WeakMap<object, string>();

export function collectionStart(data: AskRumblyData): string {
  const cached = collectionStartCache.get(data as unknown as object);
  if (cached !== undefined) return cached;
  let earliest = '';
  for (const item of data.menuItems) {
    const seen = (item.first_seen ?? '').slice(0, 10);
    if (seen && (earliest === '' || seen < earliest)) earliest = seen;
  }
  collectionStartCache.set(data as unknown as object, earliest);
  return earliest;
}

export function itemIsRecent(item: MenuItem, data: AskRumblyData, withinDays: number): boolean {
  const seen = (item.first_seen ?? '').slice(0, 10);
  if (!seen) return false;
  if (seen <= collectionStart(data)) return false;
  const cutoff = new Date(Date.now() - withinDays * 86400000).toISOString().slice(0, 10);
  return seen >= cutoff;
}
