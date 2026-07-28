import type { RatingAverage } from './activity';

export type { RatingAverage };

// Shared across every display surface (restaurant header, restaurant
// peek card, menu-item row, menu-item peek card, search results) so the
// format only needs to change in one place. Count is shown only above a
// single visit -- "★ 4.0" alone already reads as a full sentence for one
// rated visit; "(1)" would just be noise.
export function formatRatingAverage(avg: RatingAverage | undefined): string | null {
  if (!avg || avg.count === 0) return null;
  const stars = avg.average.toFixed(1);
  return avg.count > 1 ? `★ ${stars} (${avg.count})` : `★ ${stars}`;
}
