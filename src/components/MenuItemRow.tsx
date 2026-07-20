import { StyleSheet, Text, View } from 'react-native';
import type { MenuItem } from '../data/types';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

// General-purpose (not nested under restaurant-detail/) — Milestone 5
// ended up building a dedicated ItemResultRow for search results instead
// (different fields need to be visible there: restaurant/location, not
// description/badges), but this row gained the `highlighted` prop for
// Milestone 5's search-to-menu "brief, accessible visual emphasis" on the
// exact item the user tapped through to.
export function MenuItemRow({ item, highlighted = false }: { item: MenuItem; highlighted?: boolean }) {
  const badges = [
    item.is_kids && 'Kids',
    item.is_allergy_friendly && 'Allergy-friendly',
    item.has_allergy_option && 'Allergy option available',
    item.is_alcoholic && '21+',
  ].filter(Boolean) as string[];

  return (
    <View
      accessible
      accessibilityLabel={[item.item, item.price_display, item.description, ...badges].filter(Boolean).join(', ')}
      accessibilityState={{ selected: highlighted }}
      style={[styles.row, highlighted && styles.rowHighlighted]}
    >
      <View style={styles.titleRow}>
        <Text style={[text.restaurantName, styles.name]} numberOfLines={2}>
          {item.item}
        </Text>
        <Text style={[text.body, styles.price]}>{item.price_display}</Text>
      </View>
      {!!item.description && (
        <Text style={[text.bodyMuted, styles.description]}>{item.description}</Text>
      )}
      {badges.length > 0 && (
        <View style={styles.badgeRow}>
          {badges.map((b) => (
            <View key={b} style={styles.badge}>
              <Text style={text.sectionToggle}>{b}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  // Static, not animated — reduced-motion-safe by construction, no fade
  // logic needed. Cleared on a timeout by the caller (RestaurantDetailScreen).
  rowHighlighted: {
    backgroundColor: COLORS.goldLight,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  name: {
    flex: 1,
    fontSize: 15,
  },
  price: {
    fontSize: 14,
  },
  description: {
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  badge: {
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 6,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
});
