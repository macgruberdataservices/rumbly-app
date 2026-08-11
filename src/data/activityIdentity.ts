// Structural comparison for the activity read model, so a reload that found
// nothing new can keep its previous references.
//
// This looks like a micro-optimisation and is not. activityProvider's
// reloadFromDb() re-reads everything from SQLite and used to hand consumers
// brand-new Sets, Maps and a brand-new read model on every call, even when
// not one row had changed -- which is the common case, since
// MyRumblyHomeScreen refreshes on focus and focusing a tab rarely changes
// your own activity.
//
// FindFeed memoizes buildFindFeed() on the read model, and buildFindFeed
// rescores the entire search index: 31k+ entries, measured at 127ms on
// desktop V8 with an *empty* activity model, against a device that runs
// roughly 10x slower than that. So a new identity for unchanged data bought
// a full feed recompute on the next Find render -- and with Find frozen
// while blurred, that recompute landed in one lump on the My Rumbly -> Find
// tab transition. That was the hang.
//
// Comparing is cheap by contrast: these collections hold one user's own
// activity, so an unchanged reload costs a few hundred comparisons instead
// of a full-index rescore.
//
// The correctness risk runs the other way. A comparator that is too eager
// would suppress a genuine update and leave someone looking at stale
// activity, which is a real bug where a slow tab switch is only an annoyance.
// Prefer reporting "changed" whenever unsure -- see sameEventList's
// updatedAt check.

import type { PersonalActivityEvent, PersonalActivityReadModel, RatingAverage } from './activity';

export function sameStringSet(a: Set<string>, b: Set<string>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

export function sameCountMap(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

export function sameRatingMap(
  a: Map<string, RatingAverage>,
  b: Map<string, RatingAverage>
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (!other || other.average !== value.average || other.count !== value.count) return false;
  }
  return true;
}

// clientId alone is not enough. Rating a Got It you already logged changes
// neither the list length nor any clientId, so updatedAt (and rating, which
// is what such an edit actually writes) is what keeps this honest.
export function sameEventList(
  a: PersonalActivityEvent[],
  b: PersonalActivityEvent[]
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].clientId !== b[i].clientId) return false;
    if (a[i].updatedAt !== b[i].updatedAt) return false;
    if (a[i].rating !== b[i].rating) return false;
  }
  return true;
}

export function samePersonalActivity(
  a: PersonalActivityReadModel,
  b: PersonalActivityReadModel
): boolean {
  if (a === b) return true;
  return (
    a.totalGotItCount === b.totalGotItCount
    && a.ratedGotItCount === b.ratedGotItCount
    && sameEventList(a.lovedRestaurants, b.lovedRestaurants)
    && sameEventList(a.lovedItems, b.lovedItems)
    && sameEventList(a.neededRestaurants, b.neededRestaurants)
    && sameEventList(a.neededItems, b.neededItems)
    && sameEventList(a.gotItHistory, b.gotItHistory)
    && sameRatingMap(a.restaurantRatingAverages, b.restaurantRatingAverages)
    && sameRatingMap(a.itemRatingAverages, b.itemRatingAverages)
  );
}

// Written as a state updater so call sites read as `setX(keepIfSame(next,
// cmp))` -- preserving the previous reference when nothing changed is what
// makes every downstream useMemo and React.memo hold.
export function keepIfSame<T>(next: T, isSame: (a: T, b: T) => boolean): (prev: T) => T {
  return (prev) => (isSame(prev, next) ? prev : next);
}
