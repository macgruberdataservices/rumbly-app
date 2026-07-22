import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  countActiveFilters,
  cuisineLabel,
  type FilterOptions,
  type SearchFilters,
} from '../../search/filters';
import {
  QUICK_LOCATIONS,
  type QuickLocationDetailGroup,
  type QuickLocationKey,
} from '../../search/quickLocations';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';
import type { FilterGroupKey } from '../../search/findState';

const PRICE_LABELS: Record<number, string> = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
const PANEL_COLLAPSED_HEIGHT = 58;
const PANEL_TAB_HEIGHT = 40;

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function groupCount(filters: SearchFilters, group: FilterGroupKey, locationDetailCount = 0): number {
  if (group === 'location') {
    return locationDetailCount;
  }
  if (group === 'food') return filters.cuisines.size;
  if (group === 'dining') return filters.mealPeriods.size + filters.serviceTypes.size;
  return filters.priceTiers.size;
}

function clearGroup(filters: SearchFilters, group: FilterGroupKey): SearchFilters {
  if (group === 'location') {
    return { ...filters, parks: new Set(), resorts: new Set(), accessibleWithoutAdmission: false };
  }
  if (group === 'food') return { ...filters, cuisines: new Set() };
  if (group === 'dining') return { ...filters, mealPeriods: new Set(), serviceTypes: new Set() };
  return { ...filters, priceTiers: new Set(), lovedOnly: false };
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
  activeGroup,
  quickLocations,
  quickLocationDetails,
  locationDetailGroups,
  onActiveGroupChange,
  onQuickLocationToggle,
  onQuickLocationDetailToggle,
  onClearLocationDetails,
  onClearAll,
  onChange,
}: {
  filters: SearchFilters;
  options: FilterOptions;
  resultCount: number;
  visible: boolean;
  expanded: boolean;
  activeGroup: FilterGroupKey;
  quickLocations: Set<QuickLocationKey>;
  quickLocationDetails: Set<string>;
  locationDetailGroups: QuickLocationDetailGroup[];
  onActiveGroupChange: (group: FilterGroupKey) => void;
  onQuickLocationToggle: (location: QuickLocationKey) => void;
  onQuickLocationDetailToggle: (detail: string) => void;
  onClearLocationDetails: () => void;
  onClearAll: () => void;
  onChange: (filters: SearchFilters) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const expandedHeight = Math.min(220, windowHeight * 0.25);
  const height = useRef(new Animated.Value(visible ? PANEL_COLLAPSED_HEIGHT : 0)).current;
  const contentOpacity = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  // "Toast popping out of a toaster" (owner reference, 2026-07-21): now
  // that the pane is edge-to-edge and square-bottomed against the bar
  // (see expandedPane below), a width-changing scale would fight the
  // "flush with the bar" look -- dropped in favor of a bigger, bouncier
  // pure vertical launch. 70 (was 16) gives real travel distance; higher
  // bounciness (14, was 8) gives a real overshoot on the way up.
  const contentTranslateY = useRef(new Animated.Value(expanded ? 0 : 70)).current;
  // Bar's own slide-in, independent of the height-driven reveal below --
  // owner feedback: the 4-pill bar wanted "a little more slide" than the
  // height-clip reveal alone gave it.
  const pillBarTranslateY = useRef(new Animated.Value(visible ? 0 : PANEL_COLLAPSED_HEIGHT)).current;
  const activeCount = countActiveFilters(filters) + quickLocationDetails.size;
  const activeGroupCount = groupCount(filters, activeGroup, quickLocationDetails.size);
  const dockMarginBottom = height.interpolate({
    inputRange: [0, PANEL_COLLAPSED_HEIGHT],
    outputRange: [0, -insets.bottom],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    const targetHeight = !visible ? 0 : expanded ? expandedHeight : PANEL_COLLAPSED_HEIGHT;
    Animated.timing(height, {
      toValue: targetHeight,
      duration: expanded ? 300 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    Animated.spring(pillBarTranslateY, {
      toValue: visible ? 0 : PANEL_COLLAPSED_HEIGHT,
      useNativeDriver: true,
      speed: 14,
      bounciness: 6,
    }).start();

    const showingContent = visible && expanded;
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: showingContent ? 1 : 0,
        duration: showingContent ? 120 : 100,
        useNativeDriver: true,
      }),
      // Bouncy launch on the way in, quick and settled on the way out --
      // matches how iOS sheets typically feel: playful open, brisk close.
      showingContent
        ? Animated.spring(contentTranslateY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 14 })
        : Animated.timing(contentTranslateY, { toValue: 70, duration: 120, useNativeDriver: true }),
    ]).start();
  }, [contentOpacity, contentTranslateY, expanded, expandedHeight, height, pillBarTranslateY, visible]);

  const renderOptions = () => {
    if (activeGroup === 'location') {
      return (
        <>
          {locationDetailGroups.map((group) => (
            <OptionBlock key={group.key} title={group.label}>
              {group.options.map((option) => (
                <FilterChip
                  key={option.key}
                  label={option.label}
                  active={quickLocationDetails.has(option.key)}
                  onPress={() => onQuickLocationDetailToggle(option.key)}
                />
              ))}
            </OptionBlock>
          ))}
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
      <OptionBlock title="Price">
        {[1, 2, 3, 4].map((tier) => (
          <FilterChip
            key={tier}
            label={PRICE_LABELS[tier]}
            active={filters.priceTiers.has(tier)}
            onPress={() => onChange({ ...filters, priceTiers: toggleInSet(filters.priceTiers, tier) })}
          />
        ))}
      </OptionBlock>
    );
  };

  return (
    <Animated.View
      style={[styles.dock, { height, marginBottom: dockMarginBottom }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Animated.View
        style={[
          styles.expandedPane,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        <View style={styles.groupActions}>
          <Text style={text.buttonLabel}>{resultCount} results</Text>
          <View style={styles.actionButtons}>
            <Pressable
              onPress={() => {
                if (activeGroup === 'location') onClearLocationDetails();
                else onChange(clearGroup(filters, activeGroup));
              }}
              disabled={activeGroupCount === 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: activeGroupCount === 0 }}
            >
              <Text style={[text.buttonLabel, activeGroupCount === 0 && styles.disabledText]}>Clear group</Text>
            </Pressable>
            <Pressable
              onPress={onClearAll}
              disabled={activeCount === 0 && quickLocations.size === 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: activeCount === 0 && quickLocations.size === 0 }}
            >
              <Text
                style={[
                  text.buttonLabel,
                  activeCount === 0 && quickLocations.size === 0 && styles.disabledText,
                ]}
              >
                Clear all
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.detailGroups} accessibilityRole="tablist">
          {(['location', 'food', 'dining', 'price'] as const).map((group) => {
            const selected = activeGroup === group;
            const count = groupCount(filters, group, quickLocationDetails.size);
            const label = group === 'price' ? 'Price' : group.charAt(0).toUpperCase() + group.slice(1);
            return (
              <Pressable
                key={group}
                onPress={() => onActiveGroupChange(group)}
                style={[styles.detailGroup, selected && styles.detailGroupActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.detailGroupLabel, selected && styles.detailGroupLabelActive]}>
                  {label}{count ? ` ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent}>
          {renderOptions()}
        </ScrollView>
      </Animated.View>

      {/* Search-time coarse location filters stay available while the
          detailed pane above expands independently from the filter icon. */}
      <Animated.View style={[styles.pillBar, { transform: [{ translateY: pillBarTranslateY }] }]}>
        <ScrollView
          horizontal
          style={styles.quickScroll}
          contentContainerStyle={styles.quickContent}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_LOCATIONS.map((location) => {
            const selected = quickLocations.has(location.key);
            return (
              <Pressable
                key={location.key}
                onPress={() => onQuickLocationToggle(location.key)}
                style={[styles.quickTab, selected && styles.quickTabActive]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[text.chip, selected && styles.quickTabLabelActive]}>{location.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'relative',
    // Hidden, not visible -- needed so the dock visually shrinks to
    // nothing when collapsing/hiding rather than the pillBar/expandedPane
    // poking out past its animated height mid-transition. Trade-off: a
    // few pixels of the expanded pane's shadow blur get clipped at rest
    // (unlike Swipeable's containerStyle override elsewhere, there's no
    // safe way to relax this one without breaking the collapse animation).
    overflow: 'hidden',
  },
  disabledText: {
    color: COLORS.dim,
  },
  // Full-width, edge-to-edge -- deliberately flat/unrounded (owner
  // decision 2026-07-20) so the expanded pane above visibly "springs out
  // of" this wider bar rather than the two reading as one continuous
  // rounded panel, which was the previous look.
  pillBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: PANEL_COLLAPSED_HEIGHT,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  quickScroll: {
    flex: 1,
  },
  quickContent: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  quickTab: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    height: PANEL_TAB_HEIGHT,
  },
  quickTabActive: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  quickTabLabelActive: {
    color: COLORS.goldLight,
  },
  groupActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.xs,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  detailGroups: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  detailGroup: {
    flex: 1,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  detailGroupActive: {
    borderBottomColor: COLORS.forest,
  },
  detailGroupLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 10,
    color: COLORS.muted,
  },
  detailGroupLabelActive: {
    color: COLORS.forest,
  },
  // The rounded pane that springs out of the flat pillBar below it --
  // owns its own border/radius/background/shadow now that it's no longer
  // sharing a single panel container with the bar.
  // "Toast popping out of a toaster" (owner reference, 2026-07-21):
  // edge-to-edge and flush against pillBar's top edge (bottom:
  // PANEL_COLLAPSED_HEIGHT, no gap), square where it meets the bar,
  // rounded only at the top -- reads as one continuous slot the pane
  // rises out of rather than a separate floating card. No bottom border
  // either, so pillBar's own top border is the only seam between them.
  expandedPane: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: PANEL_COLLAPSED_HEIGHT,
    left: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.15,
    elevation: 6,
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
