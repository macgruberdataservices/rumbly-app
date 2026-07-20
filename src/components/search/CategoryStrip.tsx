import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CategoryCounts, SearchCategory } from '../../hooks/useSearch';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

const TABS: { key: SearchCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'items', label: 'Items' },
  { key: 'restaurants', label: 'Restaurants' },
  { key: 'related', label: 'Related' },
];

export function CategoryStrip({
  active,
  counts,
  onSelect,
}: {
  active: SearchCategory;
  counts: CategoryCounts;
  onSelect: (category: SearchCategory) => void;
}) {
  return (
    // Third real bug in this one row, worth the full history since it
    // keeps looking fixed and then isn't: (1) a horizontal ScrollView
    // with only contentContainerStyle set (no bounded `style`) stretches
    // to fill remaining vertical space in a flex-column parent. (2) a
    // maxHeight set directly on the ScrollView's own `style` seemed to
    // fix it — held up in isolated testing — but broke again the instant
    // `counts` updated from all-zero to real numbers (confirmed on-device
    // via a before/after screenshot pair, reproducible even at default
    // Dynamic Type, ruling out the font-scaling theory from bug #2's
    // fix). Root cause: ScrollView's own `height`/`maxHeight` style is
    // unreliable across a content-width change that flips it into/out of
    // actually needing to scroll — a known RN quirk, not something
    // fixable by tuning the number. The fix that actually holds: stop
    // giving the ScrollView itself any height style at all. A plain
    // `View` (not a ScrollView) with a real fixed `height` wraps it
    // instead — plain Views don't have this recalculation-on-content-
    // change problem — and the ScrollView fills that fixed box via
    // `flex: 1`. `alignItems: 'center'` on the row still matters: it's
    // what stops the chips themselves from stretching to fill the box.
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.row}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onSelect(tab.key)}
              style={({ pressed }) => [styles.chip, isActive && styles.chipActive, pressed && styles.chipPressed]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[text.chip, isActive && styles.chipTextActive]}>
                {tab.label} {counts[tab.key]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 52,
  },
  scroll: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  chipPressed: {
    opacity: 0.6,
  },
  chipActive: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  chipTextActive: {
    color: COLORS.goldLight,
  },
});
