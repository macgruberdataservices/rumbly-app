import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeAskRumblyFeedbackPayload } from '../src/askRumbly/feedbackSanitization.ts';

test('feedback upload payload removes reconstructable location details but preserves diagnostics', () => {
  const sanitized = sanitizeAskRumblyFeedbackPayload({
    text: "Casey's Corner (150 ft away) — Chili ($4.99). Open today 10:30 AM - 11:30 PM.",
    distanceMilesByRestaurant: { 'caseys-corner': 0.0284 },
    nested: {
      coordinates: { latitude: 28.4179, longitude: -81.5813 },
      lat: 28.4179,
      lng: -81.5813,
      reason: 'Wrong result',
    },
  });

  assert.equal(sanitized.distanceMilesByRestaurant, undefined);
  assert.equal(sanitized.nested.coordinates, undefined);
  assert.equal(sanitized.nested.lat, undefined);
  assert.equal(sanitized.nested.lng, undefined);
  assert.equal(sanitized.nested.reason, 'Wrong result');
  assert.doesNotMatch(sanitized.text, /150\s*ft|0\.0284|28\.4179|-81\.5813/i);
  assert.match(sanitized.text, /Chili \(\$4\.99\)/);
  assert.match(sanitized.text, /Open today 10:30 AM - 11:30 PM/);
});
