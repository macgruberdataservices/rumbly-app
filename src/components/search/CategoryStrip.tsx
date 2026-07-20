import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
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
  );
}

const styles = StyleSheet.create({
  // Bounded independently of contentContainerStyle — an unbounded
  // horizontal ScrollView can stretch to fill remaining vertical space
  // in a flex-column parent instead of sizing to its one-line content;
  // confirmed on-device via the identical bug in FindHomeScreen's active-
  // filter chip row.
  scroll: {
    maxHeight: 52,
  },
  row: {
    flexDirection: 'row',
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
