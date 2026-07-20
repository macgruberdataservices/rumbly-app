import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Restaurant } from '../data/types';
import { formatProximityDistance } from '../location/proximity';
import { useActivity } from '../hooks/useActivity';
import { HighlightedText } from './HighlightedText';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

function priceDots(tier: number | null): string {
  if (!tier) return '';
  return '$'.repeat(tier);
}

function locationLabel(r: Restaurant): string {
  if (r.resort) return r.resort;
  if (r.area) return r.area;
  return r.park ?? '';
}

// highlightQuery is optional and defaults to undefined — existing
// non-search call sites (ParkListScreen, RestaurantListScreen) pass
// nothing and render exactly as before Milestone 6.
interface RestaurantCardProps {
  restaurant: Restaurant;
  highlightQuery?: string;
  distanceMiles?: number | null;
  onPress: () => void;
}

export const RestaurantCard = forwardRef<View, RestaurantCardProps>(function RestaurantCard(
  { restaurant, highlightQuery, distanceMiles, onPress },
  ref
) {
  const metaParts = [
    locationLabel(restaurant),
    distanceMiles === null || distanceMiles === undefined ? null : formatProximityDistance(distanceMiles),
    priceDots(restaurant.price_tier),
    restaurant.experience_type,
  ].filter(Boolean);
  const { favoritedIds, checkedInIds } = useActivity();
  const hasActivity = favoritedIds.has(restaurant.restaurant_id) || checkedInIds.has(restaurant.restaurant_id);

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[restaurant.restaurant, ...metaParts].join(', ')}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.titleRow}>
        <HighlightedText
          text={restaurant.restaurant}
          query={highlightQuery}
          style={[text.restaurantName, highlightQuery && styles.searchTitle]}
        />
        {hasActivity && <View style={styles.activityDot} />}
      </View>
      {metaParts.length > 0 && (
        <Text style={[text.bodyMuted, styles.meta]}>{metaParts.join(' · ')}</Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  cardPressed: {
    opacity: 0.6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  searchTitle: {
    fontSize: 15,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.pine,
  },
  meta: {
    marginTop: 2,
  },
});
