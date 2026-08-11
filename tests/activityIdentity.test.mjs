// Guards the fix for the My Rumbly -> Find hang.
//
// MyRumblyHomeScreen refreshes activity on focus. That reload used to hand
// consumers new Sets, Maps and a new read model every time, even when no row
// had changed -- and FindFeed memoizes buildFindFeed() on the read model,
// which rescores the whole 31k-entry search index (127ms on desktop V8 with
// an empty activity model; the device runs roughly 10x slower). So an
// unchanged reload silently bought a full feed recompute on the next Find
// render, which with Find frozen while blurred landed all at once on the tab
// transition.
//
// These comparators are the fix: an unchanged reload must preserve the
// previous references so every downstream memo holds. The tests that matter
// most are the ones asserting a REAL change is still detected -- a
// comparator that is too eager would suppress genuine updates and show
// people stale activity, which is far worse than a slow tab switch.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  keepIfSame,
  sameCountMap,
  sameEventList,
  samePersonalActivity,
  sameRatingMap,
  sameStringSet,
} from '../src/data/activityIdentity.ts';

function event(overrides = {}) {
  return {
    clientId: 'client-1',
    targetType: 'item',
    restaurantId: 'lotus-blossom-cafe',
    itemId: '17131952',
    activityType: 'got_it',
    rating: 4,
    occurredAt: '2026-08-11T10:00:00.000Z',
    updatedAt: '2026-08-11T10:00:00.000Z',
    ...overrides,
  };
}

function readModel(overrides = {}) {
  return {
    lovedRestaurants: [],
    lovedItems: [],
    neededRestaurants: [],
    neededItems: [],
    gotItHistory: [event()],
    totalGotItCount: 1,
    ratedGotItCount: 1,
    restaurantRatingAverages: new Map([['lotus-blossom-cafe', { average: 4, count: 1 }]]),
    itemRatingAverages: new Map(),
    ...overrides,
  };
}

test('equal string sets compare equal regardless of insertion order', () => {
  assert.ok(sameStringSet(new Set(['a', 'b']), new Set(['b', 'a'])));
  assert.ok(!sameStringSet(new Set(['a']), new Set(['a', 'b'])));
  assert.ok(!sameStringSet(new Set(['a']), new Set(['b'])));
});

test('count maps compare on values, not just keys', () => {
  assert.ok(sameCountMap(new Map([['a', 2]]), new Map([['a', 2]])));
  assert.ok(!sameCountMap(new Map([['a', 2]]), new Map([['a', 3]])));
  assert.ok(!sameCountMap(new Map([['a', 2]]), new Map([['b', 2]])));
});

test('rating maps compare average and count', () => {
  const base = new Map([['r', { average: 4, count: 2 }]]);
  assert.ok(sameRatingMap(base, new Map([['r', { average: 4, count: 2 }]])));
  assert.ok(!sameRatingMap(base, new Map([['r', { average: 4.5, count: 2 }]])));
  assert.ok(!sameRatingMap(base, new Map([['r', { average: 4, count: 3 }]])));
});

test('event lists detect an edit that leaves identity fields alone', () => {
  const before = [event()];
  // Rating an existing Got It changes neither clientId nor list length.
  assert.ok(!sameEventList(before, [event({ rating: 5, updatedAt: '2026-08-11T11:00:00.000Z' })]));
  // updatedAt alone must be enough, even if the rating is unchanged.
  assert.ok(!sameEventList(before, [event({ updatedAt: '2026-08-11T11:00:00.000Z' })]));
  assert.ok(sameEventList(before, [event()]));
});

test('an unchanged read model compares equal across a fresh load', () => {
  assert.ok(samePersonalActivity(readModel(), readModel()));
});

test('a real change is never suppressed', () => {
  const base = readModel();
  assert.ok(!samePersonalActivity(base, readModel({ totalGotItCount: 2 })));
  assert.ok(!samePersonalActivity(base, readModel({ ratedGotItCount: 0 })));
  assert.ok(!samePersonalActivity(base, readModel({ gotItHistory: [] })));
  assert.ok(!samePersonalActivity(base, readModel({ lovedItems: [event({ clientId: 'c2' })] })));
  assert.ok(
    !samePersonalActivity(
      base,
      readModel({ restaurantRatingAverages: new Map([['lotus-blossom-cafe', { average: 5, count: 1 }]]) })
    )
  );
});

test('keepIfSame preserves the previous reference only when equal', () => {
  const previous = new Set(['a']);
  const equal = new Set(['a']);
  const different = new Set(['a', 'b']);

  assert.equal(keepIfSame(equal, sameStringSet)(previous), previous, 'equal must keep the old ref');
  assert.equal(keepIfSame(different, sameStringSet)(previous), different, 'changed must take the new ref');
});

test('a reload that changes nothing keeps every reference stable', () => {
  // The whole point: this is the common case -- focusing My Rumbly does not
  // usually change your own activity -- and it must cost zero re-renders.
  const previous = readModel();
  const reloaded = readModel();
  assert.equal(keepIfSame(reloaded, samePersonalActivity)(previous), previous);
});
