import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Restaurant, SearchIndexEntry } from '../../data/types';
import { useActivity } from '../../hooks/useActivity';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

// Same resort > area > park single-value priority RestaurantCard already
// uses — matched for consistency with the already-shipped browse rows
// rather than the search spec's two-part "Fantasyland · Magic Kingdom"
// example, a deliberate reduction, not an oversight.
function locationLabel(r: Restaurant | null): string {
  if (!r) return '';
  if (r.resort) return r.resort;
  if (r.area) return r.area;
  return r.park ?? '';
}

// Menu-item search result row per the search spec's utility hierarchy:
// item name, restaurant, location + price. Item-level activity isn't
// tracked yet (Milestone 4 only wired Favorite/Check-In at the
// restaurant level) — the marker reflects the parent restaurant's
// activity, same signal RestaurantCard already shows.
export function ItemResultRow({
  item,
  restaurant,
  onPress,
}: {
  item: SearchIndexEntry;
  restaurant: Restaurant | null;
  onPress: () => void;
}) {
  const { favoritedIds, checkedInIds } = useActivity();
  const hasActivity =
    !!restaurant && (favoritedIds.has(restaurant.restaurant_id) || checkedInIds.has(restaurant.restaurant_id));

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.titleRow}>
        <Text style={[text.restaurantName, styles.name]} numberOfLines={1}>
          {item.item}
        </Text>
        {hasActivity && <View style={styles.activityDot} />}
      </View>
      <Text style={[text.body, styles.restaurant]} numberOfLines={1}>
        {restaurant?.restaurant ?? 'Restaurant unavailable offline'}
      </Text>
      <View style={styles.metaRow}>
        <Text style={[text.bodyMuted, styles.location]} numberOfLines={1}>
          {locationLabel(restaurant)}
        </Text>
        <Text style={[text.body, styles.price]}>{item.price_display}</Text>
      </View>
    </Pressable>
  );
}

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
    fontSize: 15,
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
