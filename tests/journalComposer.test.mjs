import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dateFromVisitDate,
  formatVisitDateLong,
  visitDateFromDate,
} from '../src/data/journalDate.ts';

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
