import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Restaurant, SearchIndexEntry } from '../../data/types';
import { formatProximityDistance } from '../../location/proximity';
import { useActivity } from '../../hooks/useActivity';
import { HighlightedText } from '../HighlightedText';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

// Same resort > area > park single-value priority RestaurantCard already
// uses — matched for consistency with the already-shipped browse rows
// rather than the search spec's two-part "Fantasyland · Magic Kingdom"
// example, a deliberate reduction, not an oversight.
function locationLabel(r: Restaurant): string {
  if (r.resort) return r.resort;
  if (r.area) return r.area;
  return r.park ?? '';
}

// Menu-item search result row per the search spec's utility hierarchy:
// item name, restaurant, location + price. Item-level activity isn't
// tracked yet (Milestone 4 only wired Favorite/Check-In at the
// restaurant level) — the marker reflects the parent restaurant's
// activity, same signal RestaurantCard already shows. `restaurant` is
// guaranteed non-null as of Milestone 6 — rank.ts now skips any item
// whose restaurant isn't in the current (possibly filtered) restaurants
// set rather than emitting it with a null restaurant.
interface ItemResultRowProps {
  item: SearchIndexEntry;
  restaurant: Restaurant;
  highlightQuery?: string;
  distanceMiles?: number | null;
  onPress: () => void;
}

export const ItemResultRow = forwardRef<View, ItemResultRowProps>(function ItemResultRow(
  { item, restaurant, highlightQuery, distanceMiles, onPress },
  ref
) {
  const { favoritedIds, checkedInIds } = useActivity();
  const hasActivity = favoritedIds.has(restaurant.restaurant_id) || checkedInIds.has(restaurant.restaurant_id);

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        item.item,
        restaurant.restaurant,
        locationLabel(restaurant),
        distanceMiles === null || distanceMiles === undefined ? null : formatProximityDistance(distanceMiles),
        item.price_display,
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.titleRow}>
        <HighlightedText
          text={item.item}
          query={highlightQuery}
          style={[text.restaurantName, styles.name]}
          numberOfLines={1}
        />
        {hasActivity && <View style={styles.activityDot} />}
      </View>
      <Text style={[text.body, styles.restaurant]} numberOfLines={1}>
        {restaurant.restaurant}
      </Text>
      <View style={styles.metaRow}>
        <Text style={[text.bodyMuted, styles.location]} numberOfLines={1}>
          {[
            locationLabel(restaurant),
            distanceMiles === null || distanceMiles === undefined ? null : formatProximityDistance(distanceMiles),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text style={[text.body, styles.price]}>{item.price_display}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  rowPressed: {
    opacity: 0.6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  name: {
    flex: 1,
    fontSize: 14,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.pine,
  },
  restaurant: {
    marginTop: 2,
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  location: {
    flex: 1,
  },
  price: {
    fontSize: 13,
  },
});
