import { StyleSheet, Text, View } from 'react-native';
import type { MenuItem } from '../data/types';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

// General-purpose (not nested under restaurant-detail/) since Milestone
// 5's search results will likely reuse this same row presentation.
export function MenuItemRow({ item }: { item: MenuItem }) {
  const badges = [
    item.is_kids && 'Kids',
    item.is_allergy_friendly && 'Allergy-friendly',
    item.has_allergy_option && 'Allergy option available',
    item.is_alcoholic && '21+',
  ].filter(Boolean) as string[];

  return (
    <View style={styles.row}>
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
