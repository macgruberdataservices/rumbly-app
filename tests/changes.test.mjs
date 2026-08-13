import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDaysStr,
  changeQueryTokens,
  changeSearchHaystack,
  clampDayStr,
  dayStr,
  daysAgoStr,
  filterChangesByQuery,
  formatRangeLabel,
  groupModeForRange,
  haystackMatchesTokens,
  isRowTappable,
  monthsInRange,
  rangeSpanDays,
  todayStr,
} from '../src/data/changes.ts';

function event(fields) {
  return {
    date: '2026-08-01',
    category: 'menu_item_added',
    restaurant_id: 'r1',
    restaurant: null,
    item: null,
    menu_category: null,
    dining_period: null,
    price: null,
    last_price: null,
    old_price: null,
    new_price: null,
    ...fields,
  };
}

test('day strings follow the local calendar, not UTC', () => {
  // The regression this guards: toISOString().slice(0, 10) on an evening
  // date west of UTC reports tomorrow, shifting every range by a day.
  const lateEvening = new Date(2026, 7, 11, 23, 30);
  assert.equal(dayStr(lateEvening), '2026-08-11');
  assert.equal(dayStr(new Date(2026, 0, 5)), '2026-01-05');

  const today = todayStr();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(today, dayStr(new Date()));
  assert.equal(daysAgoStr(0), today);
});

test('date arithmetic crosses month and year boundaries', () => {
  assert.equal(addDaysStr('2026-08-30', 3), '2026-09-02');
  assert.equal(addDaysStr('2026-01-01', -1), '2025-12-31');
  assert.equal(addDaysStr('2024-02-28', 1), '2024-02-29'); // leap year
});

test('range spans are inclusive of both endpoints', () => {
  assert.equal(rangeSpanDays('2026-08-11', '2026-08-11'), 1);
  assert.equal(rangeSpanDays('2026-08-05', '2026-08-11'), 7);
  assert.equal(rangeSpanDays('2026-07-13', '2026-08-11'), 30);
});

test('grouping switches from day to week headings past two weeks', () => {
  // The two presets have to keep the behavior they had when it was
  // hard-coded per preset: a week groups by day, a month by week.
  assert.equal(groupModeForRange('2026-08-05', '2026-08-11'), 'day');
  assert.equal(groupModeForRange('2026-07-13', '2026-08-11'), 'week');
  // Custom ranges land on the same rule by span.
  assert.equal(groupModeForRange('2026-08-11', '2026-08-11'), 'day');
  assert.equal(groupModeForRange('2026-07-29', '2026-08-11'), 'day'); // 14 days
  assert.equal(groupModeForRange('2026-07-28', '2026-08-11'), 'week'); // 15
});

test('a custom range spanning months fetches every month bucket it touches', () => {
  assert.deepEqual(monthsInRange('2026-06-28', '2026-08-02'), ['2026-06', '2026-07', '2026-08']);
  assert.deepEqual(monthsInRange('2026-08-11', '2026-08-11'), ['2026-08']);
});

test('range endpoints clamp into the allowed window', () => {
  assert.equal(clampDayStr('2026-08-11', '2026-01-01', '2026-12-31'), '2026-08-11');
  assert.equal(clampDayStr('2025-06-01', '2026-01-01', '2026-12-31'), '2026-01-01');
  assert.equal(clampDayStr('2027-06-01', '2026-01-01', '2026-12-31'), '2026-12-31');
});

test('range labels drop the year within the current year and keep it otherwise', () => {
  const year = new Date().getFullYear();
  assert.equal(formatRangeLabel(`${year}-07-01`, `${year}-08-11`), 'Jul 1 – Aug 11');
  assert.equal(formatRangeLabel(`${year}-08-11`, `${year}-08-11`), 'Aug 11');
  // A range straddling New Year has to show both years or it reads backwards.
  assert.equal(formatRangeLabel('2024-12-28', '2025-01-04'), 'Dec 28, 2024 – Jan 4, 2025');
});

test('changes search matches item, restaurant, and menu placement', () => {
  const events = [
    event({ item: 'Dole Whip', restaurant: 'Aloha Isle' }),
    event({ item: 'Turkey Leg', restaurant: 'Liberty Square Market' }),
    event({ item: 'Croissant', restaurant: 'Les Halles', menu_category: 'Pastries', dining_period: 'Breakfast' }),
    event({ category: 'restaurant_closed', item: null, restaurant: 'Sci-Fi Dine-In' }),
  ];

  assert.deepEqual(
    filterChangesByQuery(events, 'dole').map((e) => e.item),
    ['Dole Whip']
  );
  assert.deepEqual(
    filterChangesByQuery(events, 'aloha').map((e) => e.item),
    ['Dole Whip']
  );
  assert.deepEqual(
    filterChangesByQuery(events, 'breakfast pastries').map((e) => e.item),
    ['Croissant']
  );
  // Openings and closures carry no item name but are still searchable by
  // restaurant, so a search doesn't silently hide them.
  assert.equal(filterChangesByQuery(events, 'sci-fi').length, 1);
  assert.equal(filterChangesByQuery(events, '').length, events.length);
  assert.equal(filterChangesByQuery(events, '   ').length, events.length);
  assert.equal(filterChangesByQuery(events, 'nonexistent').length, 0);
});

test('multi-word queries narrow rather than widen', () => {
  const events = [
    event({ item: 'Dole Whip', restaurant: 'Aloha Isle' }),
    event({ item: 'Whipped Cream Waffle', restaurant: 'Sleepy Hollow' }),
  ];
  // OR-matching would return both here; every token has to hit.
  assert.deepEqual(
    filterChangesByQuery(events, 'whip aloha').map((e) => e.item),
    ['Dole Whip']
  );
  // Tokens may match across different fields and in any order.
  assert.deepEqual(
    filterChangesByQuery(events, 'hollow waffle').map((e) => e.item),
    ['Whipped Cream Waffle']
  );
});

test('changes search folds diacritics and case on both sides', () => {
  const events = [event({ item: 'Crème Brûlée', restaurant: 'Chefs de France' })];
  assert.equal(filterChangesByQuery(events, 'creme brulee').length, 1);
  assert.equal(filterChangesByQuery(events, 'CRÈME').length, 1);
  assert.equal(filterChangesByQuery(events, 'chefs').length, 1);
});

test('haystack and token helpers back the screen-side cached filter', () => {
  // ChangesHomeScreen precomputes haystacks once per loaded range instead
  // of calling filterChangesByQuery on every keystroke -- both paths have
  // to agree.
  const e = event({ item: 'Dole Whip', restaurant: 'Aloha Isle', menu_category: 'Frozen' });
  const haystack = changeSearchHaystack(e);
  assert.equal(haystack, 'dole whip aloha isle frozen');
  assert.equal(haystackMatchesTokens(haystack, changeQueryTokens('frozen dole')), true);
  assert.equal(haystackMatchesTokens(haystack, changeQueryTokens('frozen pizza')), false);
  assert.deepEqual(changeQueryTokens('  Dole   Whip '), ['dole', 'whip']);
  assert.deepEqual(changeQueryTokens('   '), []);
});

test('a change row is only tappable when its restaurant_id resolves', () => {
  // The changes feed is generated from the full upstream dataset, so it
  // names venues this install doesn't carry. Tapping one used to land on
  // RestaurantDetail's not-found state, which -- headerShown:false,
  // gestureEnabled:false -- read as a blank page with no way back.
  // Real case, 2026-08-13: Energy Bytes graduated to a real facility as
  // `energy-bytes`, while its own restaurant_added event says
  // `energy-bytes-2`.
  const known = new Set(['energy-bytes', 'aloha-isle']);
  const added = (restaurant_id) => event({ category: 'restaurant_added', restaurant_id });

  assert.equal(isRowTappable(added('energy-bytes-2'), known), false);
  assert.equal(isRowTappable(added('energy-bytes'), known), true);
  // Withdrawn or filtered-out venues fail the same way, not just renamed ones.
  assert.equal(isRowTappable(added('good-morning-breakfast-with-goofy-and-his-pals'), known), false);
  // Closures stay untappable even when the venue is still carried, and a
  // missing id is still untappable regardless of the known set.
  assert.equal(
    isRowTappable(event({ category: 'restaurant_closed', restaurant_id: 'aloha-isle' }), known),
    false
  );
  assert.equal(isRowTappable(event({ restaurant_id: null }), known), false);
  assert.equal(isRowTappable(event({ restaurant_id: 'aloha-isle' }), known), true);
});
