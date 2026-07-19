import { forwardRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

// Purely presentational — all scroll-sync logic (deciding the active
// index from vertical scroll position, imperatively centering this strip)
// lives in RestaurantDetailScreen. This component only reports layout and
// forwards taps.
export const CategoryNavigator = forwardRef<
  ScrollView,
  {
    categories: string[];
    activeIndex: number;
    onPress: (index: number) => void;
    onChipLayout: (index: number, layout: { x: number; width: number }) => void;
  }
>(function CategoryNavigator({ categories, activeIndex, onPress, onChipLayout }, ref) {
  return (
    <View style={styles.container}>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        {categories.map((category, index) => {
          const active = index === activeIndex;
          return (
            <Pressable
              key={category}
              onPress={() => onPress(index)}
              onLayout={(e: LayoutChangeEvent) =>
                onChipLayout(index, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })
              }
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[text.chip, active && styles.chipTextActive]}>{category}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  chipActive: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  chipTextActive: {
    color: COLORS.goldLight,
  },
});
