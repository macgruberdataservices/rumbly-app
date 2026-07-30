import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dateFromVisitDate,
  formatVisitDateLong,
  visitDateFromDate,
} from '../src/data/journalDate.ts';
import { journalDraftFingerprint } from '../src/data/journalDraft.ts';

test('visit dates round-trip without a UTC date shift', () => {
  const source = new Date(2026, 6, 29, 23, 45);
  const stored = visitDateFromDate(source);
  const restored = dateFromVisitDate(stored);

  assert.equal(stored, '2026-07-29');
  assert.equal(restored.getFullYear(), 2026);
  assert.equal(restored.getMonth(), 6);
  assert.equal(restored.getDate(), 29);
});

test('visit dates have a readable display label', () => {
  assert.match(formatVisitDateLong('2026-07-29'), /2026/);
});

test('draft autosave fingerprints ignore timestamps but detect content changes', () => {
  const draft = {
    id: 'entry-1',
    userId: 'user-1',
    clientId: 'client-1',
    restaurantId: 'restaurant-1',
    itemId: 'item-1',
    restaurantNameSnapshot: 'Restaurant',
    itemNameSnapshot: 'Item',
    visitedOn: '2026-07-29',
    mealPeriodSnapshot: 'Dinner',
    note: 'Original note',
    rating: 4,
    photoIds: ['photo-1'],
    updatedAt: '2026-07-29T16:00:00.000Z',
  };

  assert.equal(
    journalDraftFingerprint(draft),
    journalDraftFingerprint({
      ...draft,
      updatedAt: '2026-07-29T16:10:00.000Z',
    })
  );
  assert.notEqual(
    journalDraftFingerprint(draft),
    journalDraftFingerprint({ ...draft, note: 'Changed note' })
  );
});
