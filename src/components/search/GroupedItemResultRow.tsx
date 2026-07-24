import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Restaurant, SearchIndexEntry } from '../../data/types';
import { restaurantLocationLabel } from '../../data/locationNames';
import { formatProximityDistance } from '../../location/proximity';
import { ItemResultRow } from './ItemResultRow';
import type { ItemMatch } from '../../search/itemGrouping';
import { COLORS, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

// Wraps the normal ItemResultRow (primary match -- full interaction
// parity, swipe actions, long-press preview, everything unchanged) with
// a collapsed "+N more locations" affordance for the other restaurants
// carrying the exact same item (owner request, 2026-07-23 -- see
// search/itemGrouping.ts for what counts as "exact same": name, price,
// and description). Expanding reveals compact, tap-to-open rows for each
// extra. Nothing here removes them from search results -- it's a purely
// visual collapse of what would otherwise be several near-identical rows
// in a row (e.g. "Cheese Cup" at 10 different snack carts).
export const GroupedItemResultRow = forwardRef<
  View,
  {
    item: SearchIndexEntry;
    restaurant: Restaurant;
    extras: ItemMatch[];
    highlightQuery?: string;
    distanceMiles?: number | null;
    getDistanceMiles: (restaurant: Restaurant) => number | null | undefined;
    onPressPrimary: () => void;
    onPressExtra: (extra: ItemMatch) => void;
  }
>(function GroupedItemResultRow(
  { item, restaurant, extras, highlightQuery, distanceMiles, getDistanceMiles, onPressPrimary, onPressExtra },
  ref
) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View>
      <ItemResultRow
        ref={ref}
        item={item}
        restaurant={restaurant}
        highlightQuery={highlightQuery}
        distanceMiles={distanceMiles}
        onPress={onPressPrimary}
      />
      <Pressable
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
        onPress={() => setExpanded((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? 'Show fewer locations'
            : `Also available at ${extras.length} other location${extras.length === 1 ? '' : 's'}`
        }
        accessibilityState={{ expanded }}
      >
        <Text style={styles.toggleLabel}>
          {expanded ? 'Show fewer' : `+${extras.length} more location${extras.length === 1 ? '' : 's'}`}
        </Text>
        <Text style={styles.toggleChevron}>{expanded ? '︿' : '﹀'}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.extrasList}>
          {extras.map((extra) => {
            const distance = getDistanceMiles(extra.restaurant);
            const metaLabel = [
              restaurantLocationLabel(extra.restaurant),
              distance === null || distance === undefined ? null : formatProximityDistance(distance),
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable
                key={`${extra.item.restaurant_id}:${extra.item.item_id}`}
                style={({ pressed }) => [styles.extraRow, pressed && styles.extraRowPressed]}
                onPress={() => onPressExtra(extra)}
                accessibilityRole="button"
                accessibilityLabel={[extra.restaurant.restaurant, metaLabel].filter(Boolean).join(', ')}
              >
                <View style={styles.extraCopy}>
                  <Text style={text.body} numberOfLines={1}>
                    {extra.restaurant.restaurant}
                  </Text>
                  {!!metaLabel && (
                    <Text style={[text.bodyMuted, styles.extraMeta]} numberOfLines={1}>
                      {metaLabel}
                    </Text>
                  )}
                </View>
                <Text style={styles.extraChevron}>›</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  togglePressed: {
    backgroundColor: COLORS.goldLight,
  },
  toggleLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 12,
    color: COLORS.forest,
  },
  toggleChevron: {
    fontSize: 10,
    color: COLORS.forest,
  },
  extrasList: {
    backgroundColor: COLORS.cream,
  },
  extraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginLeft: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  extraRowPressed: {
    backgroundColor: COLORS.goldLight,
  },
  extraCopy: {
    flex: 1,
    minWidth: 0,
  },
  extraMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  extraChevron: {
    fontSize: 18,
    color: COLORS.dim,
    marginLeft: SPACING.sm,
  },
});
