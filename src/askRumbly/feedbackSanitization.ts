const DISTANCE_TEXT_PATTERN = /(?:<\s*)?\d+(?:\.\d+)?\s*(?:ft|mi)(?:\s+away)?\b/gi;
const LOCATION_KEYS = new Set([
  'coordinates',
  'distanceMilesByRestaurant',
  'lat',
  'latitude',
  'lng',
  'longitude',
]);

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(DISTANCE_TEXT_PATTERN, '[distance redacted]')
      .replace(/\(\s*\[distance redacted\]\s*\)/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !LOCATION_KEYS.has(key))
      .map(([key, child]) => [key, sanitizeValue(child)]),
  );
}

/**
 * Removes exact or reconstructable location measurements from diagnostics
 * before they leave the device. The semantic plan, proof failures, result
 * identities, and non-location response wording remain available for review.
 */
export function sanitizeAskRumblyFeedbackPayload<T>(value: T): T {
  return sanitizeValue(value) as T;
}
