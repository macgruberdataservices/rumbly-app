// A literal "added in the last 30 days" rule would flag almost the
// entire app right now -- the dataset itself is only about two weeks
// old, so most items' first_seen falls inside any 30-day rolling window
// regardless of whether they're actually new. NEW_ITEM_SINCE is a fixed
// floor on top of the real rolling window below (owner decision,
// 2026-07-23): an item only counts as new if it was first seen after
// this baseline AND within the last NEW_ITEM_WINDOW_DAYS of today, so
// the initial bulk-load doesn't get tagged new on day one, and anything
// that does get tagged still ages out and stops being "new" once enough
// real time has passed -- the floor just stops mattering once "today"
// itself is more than NEW_ITEM_WINDOW_DAYS past it, at which point this
// is a plain rolling window and NEW_ITEM_SINCE can be deleted.
export const NEW_ITEM_SINCE = '2026-07-18';
const NEW_ITEM_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isNewMenuItem(firstSeen: string): boolean {
  if (firstSeen <= NEW_ITEM_SINCE) return false;
  const firstSeenMs = new Date(`${firstSeen}T00:00:00Z`).getTime();
  const ageDays = (Date.now() - firstSeenMs) / MS_PER_DAY;
  return ageDays <= NEW_ITEM_WINDOW_DAYS;
}
