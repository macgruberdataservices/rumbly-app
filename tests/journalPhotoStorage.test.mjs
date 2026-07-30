import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dimensionsForLongEdge,
  formatStorageBytes,
} from '../src/media/journalPhotoSizing.ts';

test('Journal display variants cap landscape photos without changing aspect ratio', () => {
  assert.deepEqual(dimensionsForLongEdge(4032, 3024, 1600), {
    width: 1600,
  });
});

test('Journal thumbnail variants cap portrait photos by height', () => {
  assert.deepEqual(dimensionsForLongEdge(3024, 4032, 360), {
    height: 360,
  });
});

test('Journal photo variants do not upscale smaller images', () => {
  assert.deepEqual(dimensionsForLongEdge(320, 240, 1600), {});
});

test('Journal storage totals use readable units', () => {
  assert.equal(formatStorageBytes(0), '0 B');
  assert.equal(formatStorageBytes(1536), '1.5 KB');
  assert.equal(formatStorageBytes(5 * 1024 * 1024), '5.0 MB');
});
