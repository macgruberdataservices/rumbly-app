import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  countActiveFilters,
  cuisineLabel,
  emptyFilters,
  type FilterOptions,
  type SearchFilters,
} from '../../search/filters';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

const PRICE_LABELS: Record<number, string> = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
const PANEL_COLLAPSED_HEIGHT = 58;
const PANEL_TAB_HEIGHT = 40;
type FilterGroupKey = 'location' | 'food' | 'dining' | 'price';

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function groupCount(filters: SearchFilters, group: FilterGroupKey): number {
  if (group === 'location') {
    return filters.parks.size + filters.resorts.size + (filters.accessibleWithoutAdmission ? 1 : 0);
  }
  if (group === 'food') return filters.cuisines.size;
  if (group === 'dining') return filters.mealPeriods.size + filters.serviceTypes.size;
  return filters.priceTiers.size + (filters.favoritesOnly ? 1 : 0);
}

function clearGroup(filters: SearchFilters, group: FilterGroupKey): SearchFilters {
  if (group === 'location') {
    return { ...filters, parks: new Set(), resorts: new Set(), accessibleWithoutAdmission: false };
  }
  if (group === 'food') return { ...filters, cuisines: new Set() };
  if (group === 'dining') return { ...filters, mealPeriods: new Set(), serviceTypes: new Set() };
  return { ...filters, priceTiers: new Set(), favoritesOnly: false };
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[text.chip, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function OptionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.optionBlock}>
      <Text style={[text.sectionToggle, styles.optionTitle]}>{title.toUpperCase()}</Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

export function FilterPanel({
  filters,
  options,
  resultCount,
  visible,
  expanded,
  onExpandedChange,
  onChange,
}: {
  filters: SearchFilters;
  options: FilterOptions;
  resultCount: number;
  visible: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onChange: (filters: SearchFilters) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [activeGroup, setActiveGroup] = useState<FilterGroupKey>('location');
  const expandedHeight = Math.min(220, windowHeight * 0.25);
  const height = useRef(new Animated.Value(visible ? PANEL_COLLAPSED_HEIGHT : 0)).current;
  const contentOpacity = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const contentTranslateY = useRef(new Animated.Value(expanded ? 0 : 12)).current;
  const activeCount = countActiveFilters(filters);
  const activeGroupCount = groupCount(filters, activeGroup);

  useEffect(() => {
    const targetHeight = !visible ? 0 : expanded ? expandedHeight : PANEL_COLLAPSED_HEIGHT;
    Animated.parallel([
      Animated.timing(height, {
        toValue: targetHeight,
        duration: expanded ? 300 : 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(contentOpacity, {
        toValue: visible && expanded ? 1 : 0,
        duration: expanded ? 220 : 120,
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: visible && expanded ? 0 : 12,
        duration: expanded ? 280 : 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOpacity, contentTranslateY, expanded, expandedHeight, height, visible]);

  const renderOptions = () => {
    if (activeGroup === 'location') {
      return (
        <>
          <OptionBlock title="Parks">
            {options.parks.map((park) => (
              <FilterChip
                key={park}
                label={park}
                active={filters.parks.has(park)}
                onPress={() => onChange({ ...filters, parks: toggleInSet(filters.parks, park) })}
              />
            ))}
          </OptionBlock>
          <OptionBlock title="Resorts">
            {options.resorts.map((resort) => (
              <FilterChip
                key={resort}
                label={resort}
                active={filters.resorts.has(resort)}
                onPress={() => onChange({ ...filters, resorts: toggleInSet(filters.resorts, resort) })}
              />
            ))}
          </OptionBlock>
          <OptionBlock title="Admission">
            <FilterChip
              label="No park admission"
              active={filters.accessibleWithoutAdmission}
              onPress={() => onChange({ ...filters, accessibleWithoutAdmission: !filters.accessibleWithoutAdmission })}
            />
          </OptionBlock>
        </>
      );
    }

    if (activeGroup === 'food') {
      return (
        <OptionBlock title="Cuisine">
          {options.cuisines.map((cuisine) => (
            <FilterChip
              key={cuisine}
              label={cuisineLabel(cuisine)}
              active={filters.cuisines.has(cuisine)}
              onPress={() => onChange({ ...filters, cuisines: toggleInSet(filters.cuisines, cuisine) })}
            />
          ))}
        </OptionBlock>
      );
    }

    if (activeGroup === 'dining') {
      return (
        <>
          <OptionBlock title="Meal Period">
            {options.mealPeriods.map((period) => (
              <FilterChip
                key={period}
                label={period}
                active={filters.mealPeriods.has(period)}
                onPress={() => onChange({ ...filters, mealPeriods: toggleInSet(filters.mealPeriods, period) })}
              />
            ))}
          </OptionBlock>
          <OptionBlock title="Service">
            {options.serviceTypes.map((type) => (
              <FilterChip
                key={type}
                label={type}
                active={filters.serviceTypes.has(type)}
                onPress={() => onChange({ ...filters, serviceTypes: toggleInSet(filters.serviceTypes, type) })}
              />
            ))}
          </OptionBlock>
        </>
      );
    }

    return (
      <OptionBlock title="Price & Personal">
        {[1, 2, 3, 4].map((tier) => (
          <FilterChip
            key={tier}
            label={PRICE_LABELS[tier]}
            active={filters.priceTiers.has(tier)}
            onPress={() => onChange({ ...filters, priceTiers: toggleInSet(filters.priceTiers, tier) })}
          />
        ))}
        <FilterChip
          label="Favorites"
          active={filters.favoritesOnly}
          onPress={() => onChange({ ...filters, favoritesOnly: !filters.favoritesOnly })}
        />
      </OptionBlock>
    );
  };

  return (
    <Animated.View style={[styles.dock, { height }]} pointerEvents={visible ? 'auto' : 'none'}>
      <View style={styles.panel}>
        <Animated.View
          style={[
            styles.expandedContent,
            { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] },
          ]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          <View style={styles.groupActions}>
            <Text style={text.buttonLabel}>{resultCount} results</Text>
            <View style={styles.actionButtons}>
              <Pressable
                onPress={() => onChange(clearGroup(filters, activeGroup))}
                disabled={activeGroupCount === 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: activeGroupCount === 0 }}
              >
                <Text style={[text.buttonLabel, activeGroupCount === 0 && styles.disabledText]}>Clear group</Text>
              </Pressable>
              <Pressable
                onPress={() => onChange(emptyFilters())}
                disabled={activeCount === 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: activeCount === 0 }}
              >
                <Text style={[text.buttonLabel, activeCount === 0 && styles.disabledText]}>Clear all</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent}>
            {renderOptions()}
          </ScrollView>
        </Animated.View>

        <View style={styles.groupTabs}>
          {(['location', 'food', 'dining', 'price'] as const).map((group) => {
            const selected = expanded && activeGroup === group;
            const count = groupCount(filters, group);
            const label = group === 'price' ? 'Price' : group.charAt(0).toUpperCase() + group.slice(1);
            return (
              <Pressable
                key={group}
                onPress={() => {
                  setActiveGroup(group);
                  onExpandedChange(true);
                }}
                style={[styles.groupTab, selected && styles.groupTabActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[text.chip, selected && styles.groupTabTextActive]}>
                  {label}{count ? ` ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    overflow: 'hidden',
  },
  panel: {
    flex: 1,
    position: 'relative',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  disabledText: {
    color: COLORS.dim,
  },
  groupTabs: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    bottom: SPACING.sm,
    height: PANEL_TAB_HEIGHT,
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  groupTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: SPACING.xs,
    height: PANEL_TAB_HEIGHT,
  },
  groupTabActive: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  groupTabTextActive: {
    color: COLORS.goldLight,
  },
  groupActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  expandedContent: {
    position: 'absolute',
    top: 0,
    right: SPACING.md,
    bottom: PANEL_TAB_HEIGHT + SPACING.sm,
    left: SPACING.md,
  },
  optionsScroll: {
    flex: 1,
  },
  optionsContent: {
    paddingBottom: SPACING.xs,
  },
  optionBlock: {
    marginBottom: SPACING.md,
  },
  optionTitle: {
    marginBottom: SPACING.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
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
