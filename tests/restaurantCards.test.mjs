import assert from 'node:assert/strict';
import test from 'node:test';
import { getTodayStatus } from '../src/data/hoursStatus.ts';
import { sanitizeRestaurantDescription } from '../src/data/restaurantDescription.ts';

test('restaurant descriptions remove markup and decode entities', () => {
  const description = [
    'Classic fare.<p><strong>An Important Message</strong><br>',
    'Valid&nbsp;admission &amp; a &quot;reservation&quot; may be required.</p>',
    '<!-- stale notice --><p>Visit <a href="https://example.com">Disney</a>.</p>',
  ].join('');

  assert.equal(
    sanitizeRestaurantDescription(description),
    'Classic fare.'
  );
});

test('restaurant descriptions decode numeric entities and tolerate null', () => {
  assert.equal(sanitizeRestaurantDescription('Tea &#38; treats &#x2014; daily.'), 'Tea & treats — daily.');
  assert.equal(sanitizeRestaurantDescription(null), '');
});

test('card hours show the complete daily range while status keeps its contextual label', () => {
  const hoursData = {
    generated: '2026-07-22',
    days: ['2026-07-22'],
    restaurants: {
      restaurant: {
        '2026-07-22': { periods: [], open: '08:00', close: '22:00' },
      },
    },
    unmapped_period_ids: [],
    unmapped_facility_ids: [],
  };

  const status = getTodayStatus(hoursData, 'restaurant');
  assert.equal(status.scheduleLabel, '8:00 AM - 10:00 PM');
  assert.match(status.label, /^(Open until|Closed)/);
});
